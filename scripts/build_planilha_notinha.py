# -*- coding: utf-8 -*-
"""
build_planilha_notinha.py — gera a Notinha_Planilha_Mestre.xlsx

Planilha financeira anual da Notinha: 1 arquivo com 12 abas mensais
(Janeiro..Dezembro) + Como usar + Visão Anual + Metas Financeiras + Investimento.

Categorias: fonte de verdade é o worker `processar-fila` (Supabase edge function),
const CATEGORIAS — 12 categorias, não a lista de 16 do briefing original.

Uso: python3 build_planilha_notinha.py [saida.xlsx]
"""
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.chart import BarChart, PieChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

# ---------------------------------------------------------------- identidade
TEAL = "288A89"      # cabeçalhos/títulos
DARK = "0D1117"      # faixas de destaque
OFFWHITE = "F4F6F6"  # células/cartões
BORDER = "E3E9E9"    # bordas
WHITE = "FFFFFF"

ANO = 2026  # ano de referência da planilha (usado só no insight "gasto médio/dia")

F_TEAL = PatternFill("solid", fgColor=TEAL)
F_DARK = PatternFill("solid", fgColor=DARK)
F_CARD = PatternFill("solid", fgColor=OFFWHITE)

FT_TITLE = Font(name="Arial", size=18, bold=True, color=WHITE)
FT_HEAD = Font(name="Arial", size=11, bold=True, color=WHITE)
FT_HEAD_DARK = Font(name="Arial", size=11, bold=True, color=WHITE)
FT_BODY = Font(name="Arial", size=10, color="1A1A1A")
FT_BODY_B = Font(name="Arial", size=10, bold=True, color="1A1A1A")
FT_BIG = Font(name="Arial", size=16, bold=True, color=WHITE)

THIN = Side(style="thin", color=BORDER)
B_ALL = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

AC = Alignment(horizontal="center", vertical="center", wrap_text=True)
AL = Alignment(horizontal="left", vertical="center", wrap_text=True)
AR = Alignment(horizontal="right", vertical="center")

FMT_BRL = 'R$ #,##0.00'
FMT_DATE = 'DD/MM/YYYY'
FMT_PCT = '0.0%'

MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
         "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
               "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

# Fonte de verdade: const CATEGORIAS do worker processar-fila
CATEGORIAS = ["Alimentação", "Mercado", "Farmácia", "Combustível", "Transporte",
              "Vestuário", "Eletrônicos", "Casa", "Saúde", "Lazer", "Serviços", "Outros"]
TIPOS_PAGAMENTO = ["Débito", "Nubank", "Inter", "Itaú", "Crédito", "Pix"]
SAIDAS_LINHAS = ["Débito", "Nubank", "Inter", "Itaú", "Reserva", "Metas"]

GASTOS_INI, GASTOS_FIM = 5, 44          # 40 linhas de lançamentos (col A:E)
CAT_INI = 5
CAT_FIM = CAT_INI + len(CATEGORIAS) - 1  # 16

DV_CATS = '"' + ",".join(CATEGORIAS) + '"'
DV_TIPOS = '"' + ",".join(TIPOS_PAGAMENTO) + '"'
DV_PAGO = '"Sim,Não"'


# ---------------------------------------------------------------- helpers
def paint(ws, rng, fill=None, font=None, border=B_ALL, align=None, fmt=None):
    """Aplica estilo em TODAS as células do range (inclusive mescladas)."""
    for row in ws[rng]:
        for c in row:
            if fill is not None:
                c.fill = fill
            if font is not None:
                c.font = font
            if border is not None:
                c.border = border
            if align is not None:
                c.alignment = align
            if fmt is not None:
                c.number_format = fmt


def merged(ws, rng, text, fill=F_TEAL, font=FT_HEAD, align=AC, fmt=None):
    ws.merge_cells(rng)
    anchor = rng.split(":")[0]
    ws[anchor] = text
    paint(ws, rng, fill=fill, font=font, align=align, fmt=fmt)


def set_widths(ws, widths):
    for col, w in widths.items():
        ws.column_dimensions[col].width = w


def card_rows(ws, rng, fmt_map=None):
    """Linhas de dados em estilo cartão (off-white, borda clara)."""
    paint(ws, rng, fill=F_CARD, font=FT_BODY, align=AL)
    if fmt_map:
        first, last = rng.split(":")
        r1 = int("".join(ch for ch in first if ch.isdigit()))
        r2 = int("".join(ch for ch in last if ch.isdigit()))
        for col, fmt in fmt_map.items():
            for r in range(r1, r2 + 1):
                ws[f"{col}{r}"].number_format = fmt
                if fmt in (FMT_BRL, FMT_PCT):
                    ws[f"{col}{r}"].alignment = AR
                elif fmt == FMT_DATE:
                    ws[f"{col}{r}"].alignment = AC


# ---------------------------------------------------------------- aba mensal
def montar_mes(ws, idx):
    """idx: 0..11"""
    mes = MESES[idx]
    ws.sheet_properties.tabColor = TEAL
    ws.sheet_view.showGridLines = False
    set_widths(ws, {"A": 28, "B": 12, "C": 12, "D": 16, "E": 14, "F": 2,
                    "G": 12, "H": 16, "I": 14, "J": 2,
                    "K": 18, "L": 14, "M": 13, "N": 13, "O": 2})
    ws.row_dimensions[1].height = 34
    ws.freeze_panes = "A5"

    merged(ws, "A1:N1", f"{mes} · Notinha — Planilha Mestre {ANO}",
           fill=F_TEAL, font=FT_TITLE)

    # ---- Bloco 3: Gastos do Mês (A:E) — preenchido pelo bot
    merged(ws, "A3:C3", "GASTOS DO MÊS (preenchido pelo bot)")
    ws["D3"] = "Total:"
    ws["E3"] = f"=SUM(E{GASTOS_INI}:E{GASTOS_FIM})"
    paint(ws, "D3:E3", fill=F_DARK, font=FT_HEAD_DARK, align=AR)
    ws["E3"].number_format = FMT_BRL
    for col, h in zip("ABCDE", ["Nome", "Data", "Tipo", "Categoria", "Valor"]):
        ws[f"{col}4"] = h
    paint(ws, "A4:E4", fill=F_TEAL, font=FT_HEAD, align=AC)
    card_rows(ws, f"A{GASTOS_INI}:E{GASTOS_FIM}",
              {"B": FMT_DATE, "E": FMT_BRL})

    # ---- Bloco 1: Fixos (G:I)
    merged(ws, "G3:H3", "FIXOS")
    ws["I3"] = "=SUM(I5:I12)"
    paint(ws, "I3:I3", fill=F_DARK, font=FT_HEAD_DARK, align=AR, fmt=FMT_BRL)
    for col, h in zip("GHI", ["Tipo", "Categoria", "Valor"]):
        ws[f"{col}4"] = h
    paint(ws, "G4:I4", fill=F_TEAL, font=FT_HEAD, align=AC)
    card_rows(ws, "G5:I12", {"I": FMT_BRL})

    # ---- Bloco 2: Cartão de Crédito (G:I)
    merged(ws, "G14:H14", "CARTÃO DE CRÉDITO")
    ws["I14"] = "=SUM(I16:I23)"
    paint(ws, "I14:I14", fill=F_DARK, font=FT_HEAD_DARK, align=AR, fmt=FMT_BRL)
    for col, h in zip("GHI", ["Tipo", "Categoria", "Valor"]):
        ws[f"{col}15"] = h
    paint(ws, "G15:I15", fill=F_TEAL, font=FT_HEAD, align=AC)
    card_rows(ws, "G16:I23", {"I": FMT_BRL})

    # ---- Bloco 4: Entradas
    merged(ws, "G25:I25", "ENTRADAS (preencha você)")
    for r, label in ((26, "Salário"), (27, "Bônus"), (28, "Total")):
        merged(ws, f"G{r}:H{r}", label, fill=F_CARD, font=FT_BODY_B, align=AL)
    card_rows(ws, "I26:I27", {"I": FMT_BRL})
    ws["I28"] = "=SUM(I26:I27)"
    paint(ws, "G28:I28", fill=F_DARK, font=FT_HEAD_DARK, align=AR, fmt=FMT_BRL)
    ws["G28"].alignment = AL

    # ---- Bloco 5: Saídas por tipo de pagamento
    merged(ws, "G30:I30", "SAÍDAS POR TIPO DE PAGAMENTO")
    for i, label in enumerate(SAIDAS_LINHAS):
        r = 31 + i
        merged(ws, f"G{r}:H{r}", label, fill=F_CARD, font=FT_BODY, align=AL)
        if label in TIPOS_PAGAMENTO:
            ws[f"I{r}"] = (
                f"=SUMIF($C${GASTOS_INI}:$C${GASTOS_FIM},$G{r},$E${GASTOS_INI}:$E${GASTOS_FIM})"
                f"+SUMIF($G$5:$G$12,$G{r},$I$5:$I$12)"
                f"+SUMIF($G$16:$G$23,$G{r},$I$16:$I$23)"
            )
        # Reserva e Metas: preenchidos manualmente (dinheiro guardado no mês)
        paint(ws, f"I{r}:I{r}", fill=F_CARD, font=FT_BODY, align=AR, fmt=FMT_BRL)
    ws["G37"] = None
    merged(ws, "G37:H37", "Total", fill=F_DARK, font=FT_HEAD_DARK, align=AL)
    ws["I37"] = "=SUM(I31:I36)"
    paint(ws, "I37:I37", fill=F_DARK, font=FT_HEAD_DARK, align=AR, fmt=FMT_BRL)

    # ---- Bloco 6: Investimentos
    merged(ws, "G39:I39", "INVESTIMENTOS")
    for r, label in ((40, "Reserva"), (41, "Renda fixa")):
        merged(ws, f"G{r}:H{r}", label, fill=F_CARD, font=FT_BODY, align=AL)
    card_rows(ws, "I40:I41", {"I": FMT_BRL})
    merged(ws, "G42:H42", "Total", fill=F_DARK, font=FT_HEAD_DARK, align=AL)
    ws["I42"] = "=SUM(I40:I41)"
    paint(ws, "I42:I42", fill=F_DARK, font=FT_HEAD_DARK, align=AR, fmt=FMT_BRL)

    # ---- Bloco 7: Saldo
    merged(ws, "G44:I44", "SALDO DO MÊS (Entradas − Saídas)")
    ws.row_dimensions[45].height = 30
    ws.merge_cells("G45:I45")
    ws["G45"] = "=I28-I37"
    paint(ws, "G45:I45", fill=F_DARK, font=FT_BIG, align=AC, fmt=FMT_BRL)

    # ---- Bloco 8: Gastos do mês por categoria (K:N)
    merged(ws, "K3:N3", "GASTOS DO MÊS POR CATEGORIA")
    for col, h in zip("KLMN", ["Categoria", "Valor esperado", "Valor gasto", "Porcentagem"]):
        ws[f"{col}4"] = h
    paint(ws, "K4:N4", fill=F_TEAL, font=FT_HEAD, align=AC)
    for i, cat in enumerate(CATEGORIAS):
        r = CAT_INI + i
        ws[f"K{r}"] = cat
        ws[f"M{r}"] = (f"=SUMIF($D${GASTOS_INI}:$D${GASTOS_FIM},$K{r},"
                       f"$E${GASTOS_INI}:$E${GASTOS_FIM})")
        ws[f"N{r}"] = f"=IFERROR(M{r}/$E$3,0)"
    card_rows(ws, f"K{CAT_INI}:N{CAT_FIM}",
              {"L": FMT_BRL, "M": FMT_BRL, "N": FMT_PCT})
    r = CAT_FIM + 1  # 17
    ws[f"K{r}"] = "Total"
    ws[f"L{r}"] = f"=SUM(L{CAT_INI}:L{CAT_FIM})"
    ws[f"M{r}"] = f"=SUM(M{CAT_INI}:M{CAT_FIM})"
    ws[f"N{r}"] = f"=IFERROR(M{r}/$E$3,0)"
    paint(ws, f"K{r}:N{r}", fill=F_DARK, font=FT_HEAD_DARK, align=AR)
    ws[f"K{r}"].alignment = AL
    ws[f"L{r}"].number_format = FMT_BRL
    ws[f"M{r}"].number_format = FMT_BRL
    ws[f"N{r}"].number_format = FMT_PCT

    # ---- Bloco 9: Gastos por tipo de pagamento (K:N)
    merged(ws, "K19:N19", "GASTOS POR TIPO DE PAGAMENTO")
    for col, h in zip("KLMN", ["Tipo", "Valor", "Data", "Pago?"]):
        ws[f"{col}20"] = h
    paint(ws, "K20:N20", fill=F_TEAL, font=FT_HEAD, align=AC)
    for i, tipo in enumerate(TIPOS_PAGAMENTO):
        r = 21 + i
        ws[f"K{r}"] = tipo
        ws[f"L{r}"] = (f"=SUMIF($C${GASTOS_INI}:$C${GASTOS_FIM},$K{r},"
                       f"$E${GASTOS_INI}:$E${GASTOS_FIM})")
    card_rows(ws, "K21:N26", {"L": FMT_BRL, "M": FMT_DATE})

    # ---- Insights do mês (K:N)
    merged(ws, "K28:N28", "INSIGHTS DO MÊS")
    insights = [
        ("Nº de lançamentos", f"=COUNT($E${GASTOS_INI}:$E${GASTOS_FIM})", None),
        ("Maior gasto", f"=IF(COUNT($E${GASTOS_INI}:$E${GASTOS_FIM})=0,0,"
                        f"MAX($E${GASTOS_INI}:$E${GASTOS_FIM}))", FMT_BRL),
        ("Onde foi o maior gasto",
         f'=IF($E$3=0,"—",INDEX($A${GASTOS_INI}:$A${GASTOS_FIM},'
         f"MATCH(MAX($E${GASTOS_INI}:$E${GASTOS_FIM}),"
         f"$E${GASTOS_INI}:$E${GASTOS_FIM},0)))", None),
        ("Categoria campeã",
         f'=IF($E$3=0,"—",INDEX($K${CAT_INI}:$K${CAT_FIM},'
         f"MATCH(MAX($M${CAT_INI}:$M${CAT_FIM}),$M${CAT_INI}:$M${CAT_FIM},0)))", None),
        ("Gasto médio por lançamento",
         f"=IFERROR(AVERAGE($E${GASTOS_INI}:$E${GASTOS_FIM}),0)", FMT_BRL),
        ("Gasto médio por dia",
         f"=IFERROR($E$3/DAY(EOMONTH(DATE({ANO},{idx + 1},1),0)),0)", FMT_BRL),
        ("% das entradas já gasto", "=IFERROR($I$37/$I$28,0)", FMT_PCT),
    ]
    for i, (label, formula, fmt) in enumerate(insights):
        r = 29 + i
        merged(ws, f"K{r}:M{r}", label, fill=F_CARD, font=FT_BODY_B, align=AL)
        ws[f"N{r}"] = formula
        paint(ws, f"N{r}:N{r}", fill=F_CARD, font=FT_BODY, align=AR,
              fmt=fmt or "General")

    # ---- Bloco 10: gráfico de pizza
    pie = PieChart()
    pie.title = "Porcentagem de gastos por categoria"
    data = Reference(ws, min_col=13, min_row=4, max_row=CAT_FIM)   # M4:M16
    cats = Reference(ws, min_col=11, min_row=CAT_INI, max_row=CAT_FIM)
    pie.add_data(data, titles_from_data=True)
    pie.set_categories(cats)
    pie.dataLabels = DataLabelList()
    pie.dataLabels.showPercent = True
    pie.height, pie.width = 9, 13
    ws.add_chart(pie, "P3")

    # ---- validações (dropdowns)
    dv_cat = DataValidation(type="list", formula1=DV_CATS, allow_blank=True,
                            showDropDown=False)
    dv_cat.add(f"D{GASTOS_INI}:D{GASTOS_FIM}")
    dv_cat.add("H5:H12")
    dv_cat.add("H16:H23")
    dv_tipo = DataValidation(type="list", formula1=DV_TIPOS, allow_blank=True,
                             showDropDown=False)
    dv_tipo.add(f"C{GASTOS_INI}:C{GASTOS_FIM}")
    dv_tipo.add("G5:G12")
    dv_tipo.add("G16:G23")
    dv_pago = DataValidation(type="list", formula1=DV_PAGO, allow_blank=True,
                             showDropDown=False)
    dv_pago.add("N21:N26")
    for dv in (dv_cat, dv_tipo, dv_pago):
        ws.add_data_validation(dv)


def exemplo_janeiro(ws):
    """~5 lançamentos de exemplo para demonstrar as fórmulas."""
    exemplos = [
        ("Supermercado Pão de Açúcar", datetime(ANO, 1, 5), "Débito", "Mercado", 312.45),
        ("iFood — jantar", datetime(ANO, 1, 8), "Nubank", "Alimentação", 56.90),
        ("Uber — corrida centro", datetime(ANO, 1, 12), "Nubank", "Transporte", 18.75),
        ("Conta de luz (Enel)", datetime(ANO, 1, 15), "Itaú", "Casa", 187.30),
        ("Farmácia Droga Raia", datetime(ANO, 1, 20), "Débito", "Farmácia", 74.20),
    ]
    for i, linha in enumerate(exemplos):
        r = GASTOS_INI + i
        for col, val in zip("ABCDE", linha):
            ws[f"{col}{r}"] = val
    ws["I26"] = 3500.00  # exemplo de salário (troque pelo seu)


# ---------------------------------------------------------------- visão anual
def montar_visao_anual(ws):
    ws.sheet_properties.tabColor = DARK
    ws.sheet_view.showGridLines = False
    set_widths(ws, {"A": 22, **{get_column_letter(c): 12 for c in range(2, 15)}})
    ws.row_dimensions[1].height = 34
    ws.freeze_panes = "A5"
    merged(ws, "A1:N1", f"Visão Anual · Notinha — Planilha Mestre {ANO}",
           fill=F_TEAL, font=FT_TITLE)

    # Resumo mensal
    merged(ws, "A3:D3", "RESUMO MENSAL")
    for col, h in zip("ABCD", ["Mês", "Total Entradas", "Total Saídas", "Saldo"]):
        ws[f"{col}4"] = h
    paint(ws, "A4:D4", fill=F_TEAL, font=FT_HEAD, align=AC)
    for i, mes in enumerate(MESES):
        r = 5 + i
        ws[f"A{r}"] = mes
        ws[f"B{r}"] = f"={mes}!$I$28"
        ws[f"C{r}"] = f"={mes}!$I$37"
        ws[f"D{r}"] = f"={mes}!$G$45"
    card_rows(ws, "A5:D16", {"B": FMT_BRL, "C": FMT_BRL, "D": FMT_BRL})
    ws["A17"] = "TOTAL DO ANO"
    for col in "BCD":
        ws[f"{col}17"] = f"=SUM({col}5:{col}16)"
    paint(ws, "A17:D17", fill=F_DARK, font=FT_HEAD_DARK, align=AR, fmt=FMT_BRL)
    ws["A17"].alignment = AL
    ws["A17"].number_format = "General"

    bar = BarChart()
    bar.type = "col"
    bar.title = "Gasto total por mês"
    data = Reference(ws, min_col=3, min_row=4, max_row=16)  # C4:C16
    cats = Reference(ws, min_col=1, min_row=5, max_row=16)
    bar.add_data(data, titles_from_data=True)
    bar.set_categories(cats)
    bar.legend = None
    bar.height, bar.width = 7.5, 15
    ws.add_chart(bar, "F3")

    # Categoria × 12 meses
    merged(ws, "A20:N20", "GASTOS POR CATEGORIA × MÊS")
    ws["A21"] = "Categoria"
    for i, ab in enumerate(MESES_ABREV):
        ws[f"{get_column_letter(2 + i)}21"] = ab
    ws["N21"] = "Total"
    paint(ws, "A21:N21", fill=F_TEAL, font=FT_HEAD, align=AC)
    for i, cat in enumerate(CATEGORIAS):
        r = 22 + i
        ws[f"A{r}"] = cat
        for m, mes in enumerate(MESES):
            ws[f"{get_column_letter(2 + m)}{r}"] = f"={mes}!$M${CAT_INI + i}"
        ws[f"N{r}"] = f"=SUM(B{r}:M{r})"
    card_rows(ws, "A22:N33",
              {get_column_letter(c): FMT_BRL for c in range(2, 15)})
    ws["A34"] = "Total"
    for c in range(2, 15):
        col = get_column_letter(c)
        ws[f"{col}34"] = f"=SUM({col}22:{col}33)"
    paint(ws, "A34:N34", fill=F_DARK, font=FT_HEAD_DARK, align=AR, fmt=FMT_BRL)
    ws["A34"].alignment = AL
    ws["A34"].number_format = "General"

    # Top produtos / maiores aumentos (diferencial item-a-item da Notinha)
    merged(ws, "A37:C37", "TOP PRODUTOS MAIS COMPRADOS")
    for col, h in zip("ABC", ["Produto", "Vezes comprado", "Gasto total"]):
        ws[f"{col}38"] = h
    paint(ws, "A38:C38", fill=F_TEAL, font=FT_HEAD, align=AC)
    card_rows(ws, "A39:C48", {"C": FMT_BRL})

    merged(ws, "E37:H37", "MAIORES AUMENTOS DE PREÇO")
    for col, h in zip("EFGH", ["Produto", "Preço antes", "Preço agora", "Variação %"]):
        ws[f"{col}38"] = h
    paint(ws, "E38:H38", fill=F_TEAL, font=FT_HEAD, align=AC)
    for r in range(39, 49):
        ws[f"H{r}"] = f"=IFERROR((G{r}-F{r})/F{r},0)"
    card_rows(ws, "E39:H48", {"F": FMT_BRL, "G": FMT_BRL, "H": FMT_PCT})

    # Insights do ano
    merged(ws, "A51:D51", "INSIGHTS DO ANO")
    insights = [
        ("Mês com maior gasto",
         '=IF(MAX(C5:C16)=0,"—",INDEX(A5:A16,MATCH(MAX(C5:C16),C5:C16,0)))', None),
        ("Mês com maior saldo",
         '=IF(SUM(B5:B16)=0,"—",INDEX(A5:A16,MATCH(MAX(D5:D16),D5:D16,0)))', None),
        ("Categoria campeã do ano",
         '=IF(SUM(N22:N33)=0,"—",INDEX(A22:A33,MATCH(MAX(N22:N33),N22:N33,0)))', None),
        ("Média mensal de saídas", '=IFERROR(AVERAGEIF(C5:C16,">0"),0)', FMT_BRL),
        ("Total investido no ano", "=Investimento!$D$17", FMT_BRL),
        ("Taxa de poupança do ano (Saldo ÷ Entradas)",
         "=IFERROR(D17/B17,0)", FMT_PCT),
    ]
    for i, (label, formula, fmt) in enumerate(insights):
        r = 52 + i
        merged(ws, f"A{r}:C{r}", label, fill=F_CARD, font=FT_BODY_B, align=AL)
        ws[f"D{r}"] = formula
        paint(ws, f"D{r}:D{r}", fill=F_CARD, font=FT_BODY, align=AR,
              fmt=fmt or "General")


# ---------------------------------------------------------------- metas
def montar_metas(ws):
    ws.sheet_properties.tabColor = DARK
    ws.sheet_view.showGridLines = False
    set_widths(ws, {"A": 30, "B": 14, "C": 14, "D": 14, "E": 13, "F": 14})
    ws.row_dimensions[1].height = 34
    merged(ws, "A1:F1", "Metas Financeiras · Notinha", fill=F_TEAL, font=FT_TITLE)
    merged(ws, "A3:F3", "METAS (preencha Meta, Valor alvo, Já guardado e Prazo)")
    heads = ["Meta", "Valor alvo", "Já guardado", "Falta", "% concluído", "Prazo"]
    for col, h in zip("ABCDEF", heads):
        ws[f"{col}4"] = h
    paint(ws, "A4:F4", fill=F_TEAL, font=FT_HEAD, align=AC)
    for r in range(5, 15):
        ws[f"D{r}"] = f"=B{r}-C{r}"
        ws[f"E{r}"] = f"=IFERROR(C{r}/B{r},0)"
    card_rows(ws, "A5:F14", {"B": FMT_BRL, "C": FMT_BRL, "D": FMT_BRL,
                             "E": FMT_PCT, "F": FMT_DATE})
    # Linha de exemplo (troque pelos seus valores)
    ws["A5"] = "Reserva de emergência (exemplo)"
    ws["B5"] = 5000.00
    ws["C5"] = 1500.00
    ws["F5"] = datetime(ANO, 12, 31)


# ---------------------------------------------------------------- investimento
def montar_investimento(ws):
    ws.sheet_properties.tabColor = DARK
    ws.sheet_view.showGridLines = False
    set_widths(ws, {"A": 16, "B": 14, "C": 14, "D": 14})
    ws.row_dimensions[1].height = 34
    merged(ws, "A1:D1", "Investimento · Notinha", fill=F_TEAL, font=FT_TITLE)
    merged(ws, "A3:D3", "INVESTIMENTOS POR MÊS (puxa das abas mensais)")
    for col, h in zip("ABCD", ["Mês", "Reserva", "Renda fixa", "Total"]):
        ws[f"{col}4"] = h
    paint(ws, "A4:D4", fill=F_TEAL, font=FT_HEAD, align=AC)
    for i, mes in enumerate(MESES):
        r = 5 + i
        ws[f"A{r}"] = mes
        ws[f"B{r}"] = f"={mes}!$I$40"
        ws[f"C{r}"] = f"={mes}!$I$41"
        ws[f"D{r}"] = f"={mes}!$I$42"
    card_rows(ws, "A5:D16", {"B": FMT_BRL, "C": FMT_BRL, "D": FMT_BRL})
    ws["A17"] = "TOTAL DO ANO"
    for col in "BCD":
        ws[f"{col}17"] = f"=SUM({col}5:{col}16)"
    paint(ws, "A17:D17", fill=F_DARK, font=FT_HEAD_DARK, align=AR, fmt=FMT_BRL)
    ws["A17"].alignment = AL
    ws["A17"].number_format = "General"

    bar = BarChart()
    bar.type = "col"
    bar.title = "Total investido por mês"
    data = Reference(ws, min_col=4, min_row=4, max_row=16)
    cats = Reference(ws, min_col=1, min_row=5, max_row=16)
    bar.add_data(data, titles_from_data=True)
    bar.set_categories(cats)
    bar.legend = None
    bar.height, bar.width = 7.5, 13
    ws.add_chart(bar, "F3")


# ---------------------------------------------------------------- como usar
def montar_como_usar(ws):
    ws.sheet_properties.tabColor = DARK
    ws.sheet_view.showGridLines = False
    set_widths(ws, {"A": 4, "B": 100})
    ws.row_dimensions[1].height = 34
    merged(ws, "A1:B1", "Como usar · Notinha — Planilha Mestre", fill=F_TEAL,
           font=FT_TITLE)
    linhas = [
        ("", None),
        ("O QUE O BOT PREENCHE", F_TEAL),
        ("• O bloco \"Gastos do Mês\" (colunas A–E) de cada aba mensal: é onde a "
         "Notinha lança cada nota fiscal enviada no WhatsApp.", None),
        ("", None),
        ("O QUE VOCÊ PREENCHE", F_TEAL),
        ("• Fixos e Cartão de Crédito (colunas G–I).", None),
        ("• Entradas: Salário e Bônus.", None),
        ("• Saídas: as linhas Reserva e Metas (dinheiro que você guardou no mês). "
         "Débito, Nubank, Inter e Itaú são calculados sozinhos.", None),
        ("• Investimentos: Reserva e Renda fixa.", None),
        ("• Na tabela de categorias, a coluna \"Valor esperado\" é a sua meta de "
         "gasto por categoria.", None),
        ("• Aba Metas Financeiras: Meta, Valor alvo, Já guardado e Prazo.", None),
        ("", None),
        ("COMO FUNCIONA", F_TEAL),
        ("• Cada aba mensal é auto-suficiente: totais, saldo, categorias, insights "
         "e gráfico de pizza se atualizam sozinhos.", None),
        ("• A Visão Anual, Metas e Investimento puxam os números das abas mensais "
         "automaticamente.", None),
        ("• Categoria e Tipo têm listas suspensas (as mesmas 12 categorias que a "
         "Notinha usa: " + ", ".join(CATEGORIAS) + ").", None),
        ("• Janeiro vem com 5 lançamentos de exemplo e um salário de exemplo "
         "(R$ 3.500) — apague e substitua pelos seus dados reais.", None),
        (f"• O insight \"Gasto médio por dia\" considera o calendário de {ANO}.", None),
        ("", None),
        ("LEGENDA DE CORES", F_TEAL),
        ("Cabeçalho de bloco (teal #288A89)", F_TEAL),
        ("Faixa de destaque: totais e saldo (escuro #0D1117)", F_DARK),
        ("Célula de preenchimento (off-white #F4F6F6)", F_CARD),
    ]
    r = 3
    for texto, fill in linhas:
        cell = ws[f"B{r}"]
        cell.value = texto
        if fill is F_TEAL:
            cell.fill = F_TEAL
            cell.font = FT_HEAD
        elif fill is F_DARK:
            cell.fill = F_DARK
            cell.font = FT_HEAD_DARK
        elif fill is F_CARD:
            cell.fill = F_CARD
            cell.font = FT_BODY
        else:
            cell.font = FT_BODY
        cell.alignment = AL
        r += 1


# ---------------------------------------------------------------- main
def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else (
        Path(__file__).resolve().parent.parent / "Notinha_Planilha_Mestre.xlsx")

    wb = Workbook()
    ws = wb.active
    ws.title = "Como usar"
    montar_como_usar(ws)

    for i, mes in enumerate(MESES):
        ws = wb.create_sheet(mes)
        montar_mes(ws, i)
        if i == 0:
            exemplo_janeiro(ws)

    montar_visao_anual(wb.create_sheet("Visão Anual"))
    montar_metas(wb.create_sheet("Metas Financeiras"))
    montar_investimento(wb.create_sheet("Investimento"))

    wb.save(out)
    print(f"Arquivo salvo: {out}")

    # recálculo (LibreOffice) — obrigatório para as fórmulas terem valor em cache
    recalc = next((p for p in (
        Path("/mnt/skills/public/xlsx/scripts/recalc.py"),
        Path("/root/.claude/skills/xlsx/scripts/recalc.py"),
    ) if p.exists()), None)
    if recalc:
        r = subprocess.run([sys.executable, str(recalc), str(out), "40"],
                           capture_output=True, text=True)
        print(r.stdout.strip() or r.stderr.strip())
    else:
        print("AVISO: recalc.py não encontrado — abra no Excel para calcular.")

    # validação: o arquivo abre sem erro
    wb2 = load_workbook(out)
    print("Abas:", wb2.sheetnames)


if __name__ == "__main__":
    main()
