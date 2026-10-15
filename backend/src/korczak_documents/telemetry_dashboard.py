from __future__ import annotations

from html import escape
from typing import Any
import time

import httpx

_CI_CACHE: dict[str, Any] = {"state": "unknown", "label": "SEM DADOS", "updated_at": None, "url": "https://github.com/korczaktech/kz-nexus/actions/workflows/kortex-validation.yml"}
_CI_CACHE_AT = 0.0


async def get_engine_ci_status() -> dict[str, Any]:
    """Fetch the latest engine validation run, cached to respect GitHub rate limits."""
    global _CI_CACHE_AT
    now = time.monotonic()
    if now - _CI_CACHE_AT < 300:
        return dict(_CI_CACHE)
    url = "https://api.github.com/repos/korczaktech/kz-nexus/actions/workflows/kortex-validation.yml/runs?branch=main&per_page=1"
    try:
        async with httpx.AsyncClient(timeout=2.5, headers={"Accept": "application/vnd.github+json", "User-Agent": "Korczak-Kortex-Telemetry"}) as client:
            response = await client.get(url)
            response.raise_for_status()
            runs = response.json().get("workflow_runs", [])
        if runs:
            run = runs[0]
            status = str(run.get("status", "unknown"))
            conclusion = str(run.get("conclusion") or "")
            if status != "completed":
                state, label = "running", "EM EXECUÇÃO"
            elif conclusion == "success":
                state, label = "success", "ÚLTIMA VALIDAÇÃO OK"
            else:
                state, label = "failure", "VALIDAÇÃO COM FALHA"
            _CI_CACHE.update({"state": state, "label": label, "updated_at": run.get("updated_at"), "url": run.get("html_url") or url})
        else:
            _CI_CACHE.update({"state": "unknown", "label": "SEM EXECUÇÕES", "updated_at": None, "url": url})
    except (httpx.HTTPError, ValueError, TypeError):
        # Keep the last known result if GitHub is temporarily unreachable.
        if _CI_CACHE_AT == 0:
            _CI_CACHE.update({"state": "unknown", "label": "INDISPONÍVEL", "updated_at": None, "url": url})
    _CI_CACHE_AT = now
    return dict(_CI_CACHE)


def _duration(value: int | float | None) -> str:
    if value is None:
        return "—"
    return f"{value:,.1f} ms".replace(",", "X").replace(".", ",").replace("X", ".")


def _number(value: int | float | None, suffix: str = "") -> str:
    if value is None:
        return "—"
    return f"{value:,.1f}{suffix}".replace(",", "X").replace(".", ",").replace("X", ".")


def render_dashboard(metrics: dict[str, Any], database_status: str, database_latency_ms: float | None, engine_ci: dict[str, Any] | None = None, history: list[dict[str, Any]] | None = None) -> str:
    api_ok = True
    db_ok = database_status == "operacional"
    engine_ci = engine_ci or {"state": "unknown", "label": "INDISPONÍVEL", "updated_at": None, "url": "https://github.com/korczaktech/kz-nexus/actions/workflows/kortex-validation.yml"}
    ci_state = str(engine_ci.get("state", "unknown"))
    ci_label = str(engine_ci.get("label", "INDISPONÍVEL"))
    ci_class = "pill" if ci_state == "success" else ("pill warn" if ci_state in {"failure", "running"} else "pill neutral")
    ci_updated = str(engine_ci.get("updated_at") or "Sem horário confirmado")
    ci_url = str(engine_ci.get("url") or "https://github.com/korczaktech/kz-nexus/actions/workflows/kortex-validation.yml")
    overall = "Operacional" if api_ok and db_ok else "Degradado"
    status_class = "ok" if overall == "Operacional" else "warn"

    def card(label: str, value: str, hint: str) -> str:
        return (
            '<article class="metric"><p class="metric-label">' + escape(label) + '</p>'
            '<strong class="metric-value">' + escape(value) + '</strong>'
            '<p class="metric-hint">' + escape(hint) + '</p></article>'
        )

    buckets = metrics.get("traffic_buckets_30s", [])
    max_requests = max((int(item.get("requests", 0)) for item in buckets), default=0) or 1
    bars = "".join(
        '<div class="bar-column"><div class="bar-value">' + str(int(item.get("requests", 0))) +
        '</div><div class="bar" style="height:' +
        str(max(4, round(int(item.get("requests", 0)) / max_requests * 100))) +
        '%"></div><span>' + escape(str(item.get("label", ""))) + '</span></div>'
        for item in buckets
    ) or '<p class="empty">Ainda não há amostras de tráfego suficientes.</p>'

    routes = metrics.get("top_routes_last_5m", [])
    route_rows = "".join(
        '<tr><td><code>' + escape(str(item.get("path", ""))) + '</code></td><td>' +
        str(int(item.get("requests", 0))) + '</td><td>' + str(int(item.get("errors", 0))) + '</td></tr>'
        for item in routes
    ) or '<tr><td colspan="3" class="empty">Nenhuma requisição registrada nos últimos cinco minutos.</td></tr>'

    events = metrics.get("recent_errors", [])
    event_rows = "".join(
        '<tr><td>' + escape(str(item.get("timestamp", ""))) + '</td><td><span class="severity ' +
        ("error" if item.get("severity") == "error" else "warning") + '">' +
        escape(str(item.get("severity", "warning")).upper()) + '</span></td><td>' +
        str(int(item.get("status", 0))) + '</td><td><code>' +
        escape(str(item.get("method", "")) + " " + str(item.get("path", ""))) +
        '</code></td><td>' + escape(_duration(item.get("duration_ms"))) + '</td></tr>'
        for item in events[:20]
    ) or '<tr><td colspan="5" class="empty">Nenhum erro HTTP registrado nesta instância desde o início.</td></tr>'

    history_rows = "".join(
        '<tr><td>' + escape(str(item.get("captured_at", "—"))) + '</td><td>' +
        str(int(item.get("requests_last_5m", 0))) + '</td><td>' +
        str(int(item.get("errors_last_5m", 0))) + '</td><td>' +
        escape(_number(item.get("error_rate_last_5m_percent"), "%")) + '</td><td>' +
        escape(_duration(item.get("latency_avg_ms_last_5m"))) + '</td><td>' +
        escape(_duration(item.get("latency_p95_ms_last_5m"))) + '</td></tr>'
        for item in (history or [])
    ) or '<tr><td colspan="6" class="empty">As primeiras amostras históricas serão gravadas pelo servidor. O histórico é mantido por até 30 dias.</td></tr>'

    status_counts = metrics.get("status_groups_since_start", {})
    uptime = int(metrics.get("instance_uptime_seconds", 0))
    hours, remainder = divmod(uptime, 3600)
    minutes, seconds = divmod(remainder, 60)
    uptime_text = f"{hours}h {minutes}m {seconds}s"
    cpu = metrics.get("cpu_process_percent_sampled")
    rss = metrics.get("process_rss_mb")
    sys_total = metrics.get("system_total_mb")
    sys_available = metrics.get("system_available_mb")
    captured = escape(str(metrics.get("captured_at", "—")))
    scope_note = escape(str(metrics.get("scope_note", "")))

    return f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#070b14">
<meta http-equiv="refresh" content="30">
<meta name="robots" content="noindex,nofollow">
<title>Telemetria Kortex | Korczak Technologies</title>
<style>
:root{{color-scheme:dark;--bg:#070b14;--panel:#0d1422;--panel2:#111c2d;--line:#23314a;--text:#edf2ff;--muted:#91a0b9;--blue:#9caeff;--green:#75e0b0;--yellow:#ffd17b;--red:#ff8b9b}}
*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(ellipse at 85% -15%,#202d59 0,transparent 42%),var(--bg);color:var(--text);font:14px/1.6 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}}
a{{color:var(--blue)}}.shell{{width:min(1320px,calc(100% - 40px));margin:auto}}header{{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:22px 0;border-bottom:1px solid var(--line)}}.brand{{font-weight:850;letter-spacing:.13em;text-decoration:none;color:var(--text)}}.brand small{{display:block;color:var(--blue);font-size:10px;letter-spacing:.22em}}.updated{{color:var(--muted);font-size:12px;text-align:right}}
main{{padding:35px 0 64px}}.eyebrow{{color:var(--blue);font-size:11px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;margin:0}}h1{{font-size:clamp(30px,4vw,46px);line-height:1.1;letter-spacing:-.04em;margin:10px 0}}.subtitle{{color:var(--muted);max-width:800px;margin:0}}
.overview{{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;padding:20px 22px;margin:26px 0;border:1px solid var(--line);border-radius:16px;background:linear-gradient(115deg,#111d31,#0c1320)}}.state{{display:inline-flex;align-items:center;gap:9px;font-weight:750}}.dot{{width:9px;height:9px;border-radius:50%;background:var(--green);box-shadow:0 0 12px #4bb88b}}.warn .dot{{background:var(--yellow);box-shadow:0 0 12px #bb873a}}.state.ok{{color:var(--green)}}.state.warn{{color:var(--yellow)}}.overview p{{margin:5px 0 0;color:var(--muted);font-size:12px}}
.grid{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px}}.metric,.panel{{border:1px solid var(--line);border-radius:14px;background:rgba(13,20,34,.94)}}.metric{{padding:17px;min-width:0}}.metric-label{{margin:0;color:var(--muted);font-size:12px}}.metric-value{{display:block;margin:9px 0 4px;font-size:clamp(22px,2.6vw,31px);letter-spacing:-.04em;overflow-wrap:anywhere}}.metric-hint{{margin:0;color:#7586a2;font-size:11px}}
.section-grid{{display:grid;grid-template-columns:1.1fr .9fr;gap:14px;margin-top:14px}}.panel{{padding:20px;min-width:0}}h2{{font-size:16px;margin:0 0 4px}}.panel-intro{{font-size:12px;color:var(--muted);margin:0 0 18px}}.bars{{height:190px;display:flex;align-items:stretch;gap:7px;padding-top:8px;border-bottom:1px solid var(--line)}}.bar-column{{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;min-width:0}}.bar-value{{font-size:10px;color:var(--muted)}}.bar{{width:min(25px,70%);min-height:4px;background:linear-gradient(180deg,#a7b4ff,#6579d6);border-radius:5px 5px 0 0}}.bar-column span{{font-size:9px;color:var(--muted);white-space:nowrap;transform:translateY(22px)}}.legend{{margin-top:29px;color:var(--muted);font-size:11px}}
.health-list{{display:grid;gap:10px}}.health-item{{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border-radius:10px;background:var(--panel2)}}.health-item small{{display:block;color:var(--muted);font-size:11px}}.pill{{font-size:10px;font-weight:800;letter-spacing:.05em;padding:4px 8px;border-radius:20px;color:var(--green);background:#123329;white-space:nowrap}}.pill.warn{{color:var(--yellow);background:#352a17}}.pill.neutral{{color:#a7b4cc;background:#1b273b}}
.table-wrap{{overflow-x:auto;margin-top:14px}}table{{width:100%;border-collapse:collapse;text-align:left;font-size:12px}}th{{color:#7f91ac;font-size:10px;text-transform:uppercase;letter-spacing:.1em;font-weight:700}}td,th{{padding:11px 10px;border-bottom:1px solid #1d293d;vertical-align:top}}td{{color:#cbd5e8}}tr:last-child td{{border-bottom:0}}code{{font:11px ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}}.severity{{font-size:9px;font-weight:800;padding:3px 6px;border-radius:5px}}.severity.error{{color:var(--red);background:#381d2b}}.severity.warning{{color:var(--yellow);background:#352a17}}.empty{{color:var(--muted);padding:18px 10px}}.note{{margin-top:18px;padding:14px 16px;border:1px solid #293750;border-radius:10px;color:var(--muted);font-size:11px}}footer{{padding:20px 0 28px;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;color:var(--muted);font-size:11px}}
@media(max-width:850px){{.grid{{grid-template-columns:repeat(2,minmax(0,1fr))}}.section-grid{{grid-template-columns:1fr}}}}@media(max-width:520px){{.shell{{width:calc(100% - 24px)}}header{{align-items:flex-start}}.updated{{max-width:140px}}.grid{{gap:8px}}.metric{{padding:12px}}.metric-value{{font-size:22px}}.panel{{padding:14px}}.overview{{padding:16px}}}}
</style>
</head>
<body><div class="shell">
<header><a class="brand" href="https://nexus.korczaktech.com.br/Kortex/">KORCZAK<small>KORTEX · TELEMETRIA</small></a><div class="updated">Amostra gerada pelo servidor<br><time>{captured}</time> · atualização a cada 30 s</div></header>
<main>
<p class="eyebrow">Observabilidade · Produção</p><h1>Telemetria do Kortex</h1>
<p class="subtitle">Painel renderizado no servidor, sem JavaScript no navegador. Acompanha esta instância da API e sua dependência de banco de dados; não lê conteúdo de documentos.</p>
<section class="overview"><div><span class="state {status_class}"><span class="dot"></span>{escape(overall)}</span><p>API respondendo · Banco de dados {escape(database_status)}</p></div><div><strong>Tempo ativo desta instância</strong><p>{escape(uptime_text)} · processo iniciado em {escape(str(metrics.get("started_at", "—")))}</p></div></section>
<section class="grid" aria-label="Indicadores principais">
{card("Requisições (5 min)", str(metrics.get("requests_last_5m", 0)), f"{_number(metrics.get('requests_per_minute'))} por minuto em média")}
{card("Taxa de erro (5 min)", _number(metrics.get("error_rate_last_5m_percent"), "%"), f"{metrics.get('errors_last_5m', 0)} respostas HTTP de erro")}
{card("Latência média (5 min)", _duration(metrics.get("latency_avg_ms_last_5m")), "Tempo observado na API")}
{card("Latência p95 (5 min)", _duration(metrics.get("latency_p95_ms_last_5m")), "95% das respostas abaixo deste valor")}
{card("Requisições ativas", str(metrics.get("active_requests", 0)), "Em processamento nesta instância")}
{card("CPU do processo", _number(cpu, "%") if cpu is not None else "Indisponível", "Amostra aproximada do processo Python")}
{card("Memória do processo", f"{rss} MB" if rss is not None else "Indisponível", "Memória residente (RSS)")}
{card("Latência do banco", _duration(database_latency_ms), "Ping MongoDB desta atualização")}
{card("Requisições desde início", str(metrics.get("requests_total_since_start", 0)), "Desde a inicialização do processo")}
{card("Respostas HTTP", "2xx " + str(status_counts.get("2xx", 0)) + " · 3xx " + str(status_counts.get("3xx", 0)) + " · 4xx " + str(status_counts.get("4xx", 0)) + " · 5xx " + str(status_counts.get("5xx", 0)), "Contadores desde o início")}
</section>
<div class="section-grid">
<section class="panel"><h2>Tráfego recente</h2><p class="panel-intro">Requisições por intervalos de 30 segundos · janela de cinco minutos</p><div class="bars" role="img" aria-label="Gráfico de barras de requisições por intervalos de trinta segundos">{bars}</div><p class="legend">Contagem local ao processo. Intervalos vazios indicam ausência de requisições observadas, não necessariamente indisponibilidade.</p></section>
<section class="panel"><h2>Integridade dos componentes</h2><p class="panel-intro">Verificações executadas na geração desta página</p><div class="health-list">
<div class="health-item"><div><strong>API Kortex / Nexus</strong><small>Processo HTTP e renderização do painel</small></div><span class="pill">RESPONDENDO</span></div>
<div class="health-item"><div><strong>MongoDB</strong><small>Comando ping: {escape(database_status)}</small></div><span class="pill {' ' if db_ok else 'warn'}">{'OPERACIONAL' if db_ok else 'DEGRADADO'}</span></div>
<div class="health-item"><div><strong>Validação automatizada do motor</strong><small>Última execução: {escape(ci_updated)} · <a href="{escape(ci_url, quote=True)}" rel="noopener noreferrer">ver workflow</a></small></div><span class="{escape(ci_class)}">{escape(ci_label)}</span></div>
<div class="health-item"><div><strong>Execução do motor no navegador</strong><small>O estado de cada editor aberto não é exposto ao backend</small></div><span class="pill neutral">NÃO INSTRUMENTADO</span></div>
<div class="health-item"><div><strong>Recursos do sistema</strong><small>{f'{sys_available} MB disponíveis de {sys_total} MB' if sys_available is not None and sys_total is not None else 'Detalhes do host indisponíveis neste ambiente'}</small></div><span class="pill neutral">INFORMATIVO</span></div>
</div></section>
</div>
<section class="panel table-wrap"><h2>Rotas mais acessadas</h2><p class="panel-intro">Somente os últimos cinco minutos. Identificadores numéricos são normalizados.</p><table><thead><tr><th>Rota</th><th>Requisições</th><th>Erros</th></tr></thead><tbody>{route_rows}</tbody></table></section>
<section class="panel table-wrap"><h2>Eventos HTTP recentes</h2><p class="panel-intro">Respostas 4xx e 5xx observadas nesta instância; não inclui payloads, IPs, tokens ou query strings.</p><table><thead><tr><th>Horário (UTC)</th><th>Nível</th><th>Status</th><th>Rota</th><th>Duração</th></tr></thead><tbody>{event_rows}</tbody></table></section>
<section class="panel table-wrap"><h2>Histórico persistido</h2><p class="panel-intro">Últimas 24 amostras gravadas no MongoDB, aproximadamente 24 minutos · retenção automática de 30 dias.</p><table><thead><tr><th>Capturada em</th><th>Req. (5 min)</th><th>Erros</th><th>Taxa de erro</th><th>Latência média</th><th>Latência p95</th></tr></thead><tbody>{history_rows}</tbody></table></section>
<div class="note"><strong>Limites e privacidade.</strong> {scope_note} Os contadores são em memória e reiniciam quando o processo reinicia; em ambientes com múltiplas instâncias, cada instância possui seus próprios dados. CPU e memória dependem do que o host permite expor. O resultado de CI é a última validação automatizada, não uma medição de execução ao vivo. Esta página não confirma a execução de comandos em cada editor cliente nem substitui alertas externos, logs persistentes ou monitoramento sintético.</div>
</main><footer><span>Korczak Technologies · Telemetria Kortex</span><span>HTML gerado no servidor · sem JavaScript · atualização por recarga da página</span><a href="https://nexus.korczaktech.com.br/Kortex/status.html">Voltar à Central Kortex</a></footer>
</div></body></html>"""
