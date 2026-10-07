# Lectura y análisis del CSV "tidy" exportado por Bitácora (Finanzas > Importar / Exportar).
# Una fila por partida: monto > 0 es débito, monto < 0 es crédito; cada asiento suma cero.
#
# Uso:
#   source("r/leer_bitacora.R")
#   bt <- leer_bitacora("bitacora-2026-10-07.csv")
#   bitacora_resumen(bt)              # ingresos, gastos y ahorro por mes
#   bitacora_gastos(bt, "2026-09")    # gasto por categoría en un mes
#   bitacora_grafico(bt)              # ggplot de ingresos vs gastos
#   bitacora_pronostico(bt, h = 3)    # pronóstico ETS del gasto mensual (requiere 'forecast')

suppressPackageStartupMessages({
  library(dplyr)
  library(readr)
  library(tidyr)
})

leer_bitacora <- function(ruta) {
  readr::read_csv(
    ruta,
    col_types = readr::cols(
      fecha = readr::col_date(), monto = readr::col_double(), .default = readr::col_character()
    ),
    locale = readr::locale(encoding = "UTF-8")
  ) |>
    mutate(
      mes = format(fecha, "%Y-%m"),
      # Valor con signo "natural": ingresos y gastos positivos
      valor = case_when(
        cuenta_tipo %in% c("ingreso", "pasivo", "patrimonio") ~ -monto,
        TRUE ~ monto
      )
    )
}

# Verifica partida doble: cada asiento debe sumar cero.
bitacora_validar <- function(bt) {
  bt |>
    group_by(asiento_id) |>
    summarise(suma = round(sum(monto), 2), .groups = "drop") |>
    filter(suma != 0)
}

bitacora_resumen <- function(bt) {
  bt |>
    filter(cuenta_tipo %in% c("ingreso", "gasto")) |>
    group_by(mes, cuenta_tipo) |>
    summarise(total = sum(valor), .groups = "drop") |>
    complete(mes, cuenta_tipo = c("ingreso", "gasto"), fill = list(total = 0)) |>
    pivot_wider(names_from = cuenta_tipo, values_from = total) |>
    mutate(
      resultado = ingreso - gasto,
      tasa_ahorro = if_else(ingreso > 0, resultado / ingreso, NA_real_)
    ) |>
    arrange(mes)
}

bitacora_gastos <- function(bt, mes_objetivo = NULL) {
  if (!is.null(mes_objetivo)) bt <- filter(bt, mes == mes_objetivo)
  bt |>
    filter(cuenta_tipo == "gasto") |>
    group_by(cuenta_nombre) |>
    summarise(total = sum(valor), .groups = "drop") |>
    mutate(participacion = total / sum(total)) |>
    arrange(desc(total))
}

bitacora_grafico <- function(bt) {
  if (!requireNamespace("ggplot2", quietly = TRUE)) stop("Instala ggplot2")
  bitacora_resumen(bt) |>
    pivot_longer(c(ingreso, gasto), names_to = "tipo", values_to = "valor") |>
    ggplot2::ggplot(ggplot2::aes(mes, valor, fill = tipo)) +
    ggplot2::geom_col(position = "dodge") +
    ggplot2::scale_y_continuous(labels = scales::label_dollar(big.mark = ".", decimal.mark = ",")) +
    ggplot2::scale_fill_manual(values = c(ingreso = "#2f8f6f", gasto = "#d0715c")) +
    ggplot2::labs(x = NULL, y = NULL, fill = NULL, title = "Ingresos y gastos mensuales") +
    ggplot2::theme_minimal()
}

bitacora_pronostico <- function(bt, h = 3) {
  if (!requireNamespace("forecast", quietly = TRUE)) stop("Instala el paquete 'forecast'")
  r <- bitacora_resumen(bt)
  inicio <- as.integer(strsplit(r$mes[1], "-")[[1]])
  serie <- stats::ts(r$gasto, start = inicio, frequency = 12)
  forecast::forecast(forecast::ets(serie), h = h)
}
