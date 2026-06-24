export const VIEWER_HTML = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Trace Viewer</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0d1117;--surface:#161b22;--border:#30363d;--border2:#21262d;
  --text:#e6edf3;--muted:#8b949e;--faint:#484f58;
  --blue:#58a6ff;--blue-bg:#0c2d6b;--blue-dim:#1a2e45;
  --green:#3fb950;--green-bg:#1a3322;
  --yellow:#e3b341;--yellow-bg:#3d2f0a;
  --red:#f85149;--red-bg:#3d0c0c;
  --purple:#bc8cff;--purple-bg:#2d1e4f;
}
body{font-family:'SF Mono',Consolas,monospace;background:var(--bg);color:var(--text);font-size:13px;min-height:100vh}
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:var(--surface)}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
.hdr{background:var(--surface);border-bottom:1px solid var(--border);padding:14px 24px;display:flex;align-items:center;gap:16px;position:sticky;top:0;z-index:10}
.hdr-title{font-size:14px;font-weight:700;color:#f0f6fc;white-space:nowrap}
.hdr-title em{color:var(--blue);font-style:normal}
.search{flex:1;max-width:540px;display:flex;gap:8px}
.search input{flex:1;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:7px 12px;color:var(--text);font-family:inherit;font-size:13px;outline:none}
.search input:focus{border-color:var(--blue)}
.search input::placeholder{color:var(--faint)}
.btn{background:#1f6feb;border:none;border-radius:6px;padding:7px 18px;color:#fff;font-family:inherit;font-size:13px;cursor:pointer;font-weight:600;white-space:nowrap}
.btn:hover{background:#388bfd}
.btn:disabled{background:var(--border2);color:var(--faint);cursor:not-allowed}
.main{padding:20px 24px}
.empty{text-align:center;color:var(--faint);padding:80px 0}
.empty .ico{font-size:44px;margin-bottom:12px}
.empty p{font-size:14px;line-height:1.8}
.err-box{background:var(--red-bg);border:1px solid var(--red);border-radius:8px;padding:12px 16px;color:#ffa198;margin-bottom:16px;font-size:13px}
.loading{color:var(--muted);padding:40px 0;text-align:center}
.trace-bar{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;gap:20px;flex-wrap:wrap}
.trace-bar .tid{font-size:11px;color:var(--muted)}
.trace-bar .tid b{color:var(--blue);font-weight:600}
.chip{background:var(--border2);border:1px solid var(--border);border-radius:10px;padding:2px 10px;font-size:11px;color:var(--muted)}
.chip b{color:var(--text)}
.api-table{border:1px solid var(--border);border-radius:8px;overflow:hidden}
.tbl-head{display:grid;grid-template-columns:24px 58px 1fr 110px 76px 58px 48px 100px;padding:6px 14px;background:var(--border2);border-bottom:1px solid var(--border)}
.tbl-head span{font-size:10px;font-weight:700;color:var(--faint);text-transform:uppercase;letter-spacing:.5px}
.api-row{border-bottom:1px solid var(--border2)}
.api-row:last-child{border-bottom:none}
.api-summary{display:grid;grid-template-columns:24px 58px 1fr 110px 76px 58px 48px 100px;padding:9px 14px;align-items:center;cursor:pointer;transition:background .12s;user-select:none}
.api-summary:hover{background:#1c2128}
.api-summary.open{background:#1c2128;border-bottom:1px solid var(--border)}
.toggle{width:16px;height:16px;border-radius:3px;border:1px solid var(--border);background:var(--border2);color:var(--muted);display:flex;align-items:center;justify-content:center;font-size:10px;transition:all .12s;flex-shrink:0}
.toggle.on{border-color:var(--blue);color:var(--blue);background:var(--blue-bg)}
.method{font-size:10px;font-weight:800;padding:2px 6px;border-radius:4px;text-align:center;letter-spacing:.4px}
.m-GET{background:#0d419d;color:#79c0ff}
.m-POST{background:#1a3c1a;color:#56d364}
.m-PUT,.m-PATCH{background:var(--yellow-bg);color:var(--yellow)}
.m-DELETE{background:var(--red-bg);color:var(--red)}
.api-path{color:var(--text);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:8px}
.api-service{color:var(--muted);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.api-duration{color:var(--muted);font-size:11px;text-align:right;padding-right:8px}
.api-status{font-size:11px;font-weight:700;text-align:center}
.s2{color:var(--green)}.s4{color:var(--yellow)}.s5{color:var(--red)}
.api-logs{color:var(--faint);font-size:10px;text-align:center}
.api-ip{color:var(--faint);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.timeline{background:var(--bg)}
.tl-entry{display:grid;grid-template-columns:28px 10px 72px 40px 1fr auto;gap:8px;padding:7px 16px;align-items:start;border-bottom:1px solid var(--border2);transition:background .1s;cursor:pointer}
.tl-entry:last-child{border-bottom:none}
.tl-entry:hover{background:#1c2128}
.tl-seq{color:var(--faint);font-size:10px;text-align:right;padding-top:3px}
.tl-dot{width:8px;height:8px;border-radius:50%;margin-top:5px;flex-shrink:0}
.dot-http_in,.dot-http_in_res{background:var(--blue)}
.dot-http_out{background:#3d82f0}
.dot-db{background:var(--purple)}
.dot-service{background:var(--muted)}
.dot-event{background:var(--green)}
.dot-interceptor{background:var(--faint)}
.tl-type{font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;text-transform:uppercase;letter-spacing:.4px;text-align:center;white-space:nowrap;margin-top:1px}
.t-http_in,.t-http_in_res{background:var(--blue-bg);color:#79c0ff}
.t-http_out{background:var(--blue-dim);color:var(--blue)}
.t-db{background:var(--purple-bg);color:var(--purple)}
.t-service{background:var(--border2);color:var(--muted);border:1px solid var(--border)}
.t-event{background:var(--green-bg);color:var(--green)}
.t-interceptor{background:#21262d;color:var(--faint)}
.tl-level{font-size:10px;font-weight:600;text-align:center;padding-top:2px}
.l-info{color:var(--blue)}.l-debug{color:var(--faint)}.l-warn{color:var(--yellow)}.l-error{color:var(--red)}
.tl-body{min-width:0}
.tl-msg{color:var(--text);font-size:12px;line-height:1.5;word-break:break-word}
.tl-ctx{color:var(--faint);font-size:11px;margin-left:6px}
.tl-dur{color:var(--muted);font-size:11px;white-space:nowrap;padding-top:2px}
.tl-detail{grid-column:1/-1;margin:2px 0 6px 56px;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:10px 12px}
.tl-detail pre{white-space:pre-wrap;word-break:break-all;color:#adbac7;font-size:11px;line-height:1.6}
.child-section{border-top:1px solid var(--border)}
.child-label{padding:6px 16px 4px;font-size:10px;color:var(--faint);font-weight:700;text-transform:uppercase;letter-spacing:.5px;background:var(--border2)}
</style>
</head>
<body>
<div id="root"></div>
<script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script type="text/babel">
const {useState,useCallback} = React;

const fmtDur = ms => ms==null?'':ms<1000?ms+'ms':(ms/1000).toFixed(2)+'s';
const statusCls = c => !c?'':c<300?'s2':c<500?'s4':'s5';
const TYPE_LABEL = {http_in:'HTTP IN',http_in_res:'HTTP RES',http_out:'HTTP OUT',db:'DB',service:'SERVICE',event:'EVENT',interceptor:'HANDLER'};
const CORE = new Set(['timestamp','level','message','logType','context','sequence','duration','spanId','parentSpanId','service','path','method','userId','traceId','ip','userAgent']);
const extra = log => Object.entries(log).filter(([k,v])=>!CORE.has(k)&&v!=null&&v!=='');

function TLEntry({log}) {
  const [open,setOpen] = useState(false);
  const ex = extra(log);
  return (
    <>
      <div className="tl-entry" onClick={()=>ex.length&&setOpen(v=>!v)} style={{cursor:ex.length?'pointer':'default'}}>
        <div className="tl-seq">#{log.sequence}</div>
        <div className={"tl-dot dot-"+(log.logType||'service')}/>
        <div className={"tl-type t-"+(log.logType||'service')}>{TYPE_LABEL[log.logType]??log.logType}</div>
        <div className={"tl-level l-"+log.level}>{log.level}</div>
        <div className="tl-body">
          <div className="tl-msg">
            {log.message}
            {log.context&&<span className="tl-ctx">[{log.context}]</span>}
          </div>
        </div>
        {log.duration!=null&&<div className="tl-dur">+{log.duration}ms</div>}
      </div>
      {open&&ex.length>0&&(
        <div className="tl-detail">
          <pre>{JSON.stringify(Object.fromEntries(ex),null,2)}</pre>
        </div>
      )}
    </>
  );
}

function ApiRow({span,depth=0}) {
  const [open,setOpen] = useState(false);
  const logs = span.logs??[];
  const httpIn = logs.find(l=>l.logType==='http_in');
  const ip = httpIn?.ip??'';
  const children = span.children??[];

  return (
    <div className="api-row">
      <div
        className={"api-summary "+(open?'open':'')}
        style={depth>0?{paddingLeft:14+depth*20+'px'}:{}}
        onClick={()=>setOpen(v=>!v)}
      >
        <div className={"toggle "+(open?'on':'')}>{open?'▾':'▸'}</div>
        <div className={"method m-"+span.method}>{span.method}</div>
        <div className="api-path" title={span.path}>{span.path}</div>
        <div className="api-service" title={span.service}>{span.service}</div>
        <div className="api-duration">{fmtDur(span.durationMs)}</div>
        <div className={"api-status "+statusCls(span.statusCode)}>{span.statusCode??'—'}</div>
        <div className="api-logs">{logs.length}</div>
        <div className="api-ip" title={ip}>{ip}</div>
      </div>
      {open&&(
        <div className="timeline">
          {logs.map((log,i)=><TLEntry key={i} log={log}/>)}
          {children.length>0&&(
            <div className="child-section">
              <div className="child-label">↳ downstream calls</div>
              {children.map(c=><ApiRow key={c.spanId} span={c} depth={depth+1}/>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TraceSummary({trace}) {
  return (
    <div className="trace-bar">
      <div className="tid">Trace: <b>{trace.traceId}</b></div>
      <div className="chip">⏱ <b>{fmtDur(trace.durationMs)}</b></div>
      <div className="chip">🔀 <b>{trace.spans.length}</b> spans</div>
      <div className="chip">🖥 <b>{trace.services.join(', ')}</b></div>
    </div>
  );
}

function App() {
  const [input,setInput]=useState('');
  const [trace,setTrace]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(null);
  const base = window.location.pathname.replace(/\/+$/,'');

  const search = useCallback(async()=>{
    const id=input.trim(); if(!id)return;
    setLoading(true);setError(null);setTrace(null);
    try {
      const r=await fetch(base+'/api/'+encodeURIComponent(id));
      if(r.status===404){setError('Trace not found — older than 24h or wrong ID.');return;}
      if(!r.ok){const j=await r.json();setError(j.message??'Error');return;}
      setTrace(await r.json());
    } catch(e){setError(e.message??'Network error');}
    finally{setLoading(false);}
  },[input,base]);

  return (
    <div>
      <div className="hdr">
        <div className="hdr-title">🔍 <em>Trace</em> Viewer</div>
        <div className="search">
          <input value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&search()}
            placeholder="Paste x-trace-id from any API response header…" spellCheck={false}/>
          <button className="btn" onClick={search} disabled={loading||!input.trim()}>
            {loading?'Loading…':'Search'}
          </button>
        </div>
      </div>
      <div className="main">
        {loading&&<div className="loading">Querying Loki…</div>}
        {error&&<div className="err-box">⚠ {error}</div>}
        {trace&&(
          <>
            <TraceSummary trace={trace}/>
            <div className="api-table">
              <div className="tbl-head">
                <span/><span>Method</span><span>Path</span><span>Service</span>
                <span style={{textAlign:'right'}}>Duration</span>
                <span style={{textAlign:'center'}}>Status</span>
                <span style={{textAlign:'center'}}>Logs</span>
                <span>IP</span>
              </div>
              {trace.rootSpans.map(s=><ApiRow key={s.spanId} span={s} depth={0}/>)}
            </div>
          </>
        )}
        {!loading&&!error&&!trace&&(
          <div className="empty">
            <div className="ico">🗺</div>
            <p>Each row = one API call. Click <b>▸</b> to see every log, DB query,<br/>
            event and downstream call that happened inside that request lifecycle.</p>
            <p style={{marginTop:10,fontSize:11,color:'#30363d'}}>
              traceId is in every API response as <code style={{color:'var(--blue)'}}>x-trace-id</code> header
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
</script>
</body>
</html>`;
