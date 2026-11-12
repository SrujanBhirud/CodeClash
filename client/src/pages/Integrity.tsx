import { Check, Fingerprint, RefreshCw, RotateCcw, ScanSearch, ShieldAlert, Wifi, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Alert, Empty, errorText, formatWhen, StatusPill, toast } from '../ui';

interface Contest { id: string; title: string; status: string; startsAt: string }
interface Pair {
  id: string;
  problemId: string;
  userA: string;
  userB: string;
  nameA: string;
  nameB: string;
  problem: string;
  languageA: string;
  languageB: string;
  score: number;
  sameIp: boolean;
  status: 'open' | 'dismissed' | 'confirmed';
  note: string;
  decidedAt?: string;
  decidedBy?: string;
}
interface Report { updatedAt: string | null; checked: { submissions: number; problems: number; tooShort: number; threshold: number } | null; pairs: Pair[] }
interface Detail extends Pair { codeA: string; codeB: string; shared: { a: number[]; b: number[] } }

const REVIEWABLE = ['running', 'frozen', 'ended', 'published'];
type Filter = 'open' | 'all' | 'confirmed' | 'dismissed';

function tone(score: number) {
  return score >= 0.9 ? 'bad' : score >= 0.8 ? 'warn' : 'accent';
}

export function Integrity() {
  const [params, setParams] = useSearchParams();
  const [contests, setContests] = useState<Contest[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [opened, setDetail] = useState<Detail | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const contestId = params.get('contest') ?? '';
  const pairId = params.get('pair') ?? '';

  const listed = useRef(false);
  useEffect(() => {
    if (listed.current) return;
    listed.current = true;
    api<Contest[]>('/api/contests').then((rows) => {
      const reviewable = rows.filter((c) => REVIEWABLE.includes(c.status)).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
      setContests(reviewable);
      const first = reviewable.find((c) => c.status === 'ended' || c.status === 'published') ?? reviewable[0];
      setParams((current) => (current.get('contest') || !first ? current : { contest: first.id }), { replace: true });
    }).catch((err) => setError(errorText(err)));
  }, [setParams]);

  const load = useCallback(async () => {
    if (!contestId) return;
    setReport(await api<Report>(`/api/contests/${contestId}/integrity`));
  }, [contestId]);

  useEffect(() => {
    setReport(null);
    setDetail(null);
    load().catch((err) => setError(errorText(err)));
  }, [load]);

  useEffect(() => {
    if (!contestId || !pairId) { setDetail(null); return; }
    api<Detail>(`/api/contests/${contestId}/integrity/pairs/${encodeURIComponent(pairId)}`)
      .then((row) => { setDetail(row); setNote(row.note ?? ''); })
      .catch((err) => setError(errorText(err)));
  }, [contestId, pairId]);

  async function run() {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ pairs: number }>(`/api/contests/${contestId}/integrity/run`, { method: 'POST', body: '{}' });
      await load();
      toast(result.pairs ? `${result.pairs} pair${result.pairs === 1 ? '' : 's'} to review` : 'No similar pairs', result.pairs ? 'warn' : 'ok');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function decide(decision: Pair['status']) {
    const detail = opened;
    if (!detail) return;
    setBusy(true);
    try {
      const saved = await api<{ status: Pair['status']; decidedAt: string; decidedBy: string | null }>(
        `/api/contests/${contestId}/integrity/pairs/${encodeURIComponent(detail.id)}`,
        { method: 'POST', body: JSON.stringify({ decision, note }) },
      );
      const patch = { status: saved.status, note, decidedAt: saved.decidedAt, decidedBy: saved.decidedBy ?? undefined };
      setDetail({ ...detail, ...patch });
      setReport((current) => current && { ...current, pairs: current.pairs.map((p) => (p.id === detail.id ? { ...p, ...patch } : p)) });
      toast(decision === 'open' ? 'Reopened' : decision === 'confirmed' ? 'Marked as copied' : 'Dismissed', decision === 'confirmed' ? 'warn' : 'ok');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const pairs = report?.pairs ?? [];
  const row = opened ? pairs.find((p) => p.id === opened.id) : undefined;
  const detail = opened && row ? { ...opened, ...row } : opened;
  const shown = pairs.filter((p) => filter === 'all' || p.status === filter);
  const count = (status: Pair['status']) => pairs.filter((p) => p.status === status).length;
  const contest = contests.find((c) => c.id === contestId);

  return (
    <div className="page wide">
      <div className="crumbs"><Link to="/control">control</Link> / <span>integrity</span></div>
      <div className="page-head">
        <div>
          <h1 className="row"><Fingerprint size={22} className="accent" /> Integrity review</h1>
          <p>Accepted solutions that look copied, side by side. Every view and decision is audited.</p>
        </div>
        <div className="row">
          <select aria-label="Contest" value={contestId} onChange={(e) => setParams({ contest: e.target.value })} style={{ width: 'min(22rem, 70vw)' }}>
            {contests.length === 0 ? <option value="">no contest has started</option> : null}
            {contests.map((c) => <option key={c.id} value={c.id}>{c.title} · {c.status}</option>)}
          </select>
          <button className="btn primary" type="button" onClick={run} disabled={!contestId || busy}>
            <ScanSearch size={15} /> {busy ? 'checking…' : report?.updatedAt ? 'run again' : 'run check'}
          </button>
        </div>
      </div>
      {error ? <Alert>{error}</Alert> : null}

      <div className="method-strip">
        <span><b>1</b> comments and strings removed</span>
        <span><b>2</b> names become ID, numbers NUM</span>
        <span><b>3</b> 5-token fingerprints, winnowed</span>
        <span><b>4</b> code most people share is ignored</span>
        <span><b>5</b> listed at {Math.round((report?.checked?.threshold ?? 0.7) * 100)}% or more</span>
      </div>

      <div className="stats">
        <div className="box stat"><b>{report?.checked?.submissions ?? '–'}</b><span>solutions compared</span></div>
        <div className="box stat"><b>{report?.checked?.problems ?? '–'}</b><span>problems</span></div>
        <div className="box stat"><b className={pairs.length ? 'warn' : 'ok'}>{report ? pairs.length : '–'}</b><span>pairs flagged</span></div>
        <div className="box stat"><b>{count('open')}</b><span>waiting for review</span></div>
        <div className="box stat"><b className="bad">{count('confirmed')}</b><span>confirmed</span></div>
        <div className="box stat"><b className="ok">{count('dismissed')}</b><span>dismissed</span></div>
      </div>

      {!report ? <div className="skeleton" style={{ height: '16rem' }} /> : !report.updatedAt ? (
        <div className="box"><Empty icon={<ScanSearch size={22} />} title={`No check has run for ${contest?.title ?? 'this contest'} yet`}>
          Run the check to compare every accepted solution. It also runs by itself when a contest ends.
        </Empty></div>
      ) : (
        <div className="integrity">
          <aside className="pair-list">
            <div className="pair-list-head">
              <div className="segmented" role="tablist" aria-label="Show">
                {(['all', 'open', 'confirmed', 'dismissed'] as Filter[]).map((key) => (
                  <button key={key} type="button" className={filter === key ? 'on' : ''} onClick={() => setFilter(key)}>{key}</button>
                ))}
              </div>
              <span className="muted small">checked {formatWhen(report.updatedAt)}</span>
            </div>
            {shown.length === 0 ? (
              <Empty icon={<Check size={20} />} title={pairs.length ? 'Nothing in this view' : 'No similar pairs'}>
                {pairs.length ? null : `${report.checked?.submissions ?? 0} accepted solutions, none at ${Math.round((report.checked?.threshold ?? 0.7) * 100)}% or above.`}
              </Empty>
            ) : shown.map((pair) => (
              <button key={pair.id} type="button" className={`pair-card ${pair.id === pairId ? 'on' : ''}`} onClick={() => setParams({ contest: contestId, pair: pair.id })}>
                <div className="pair-names"><b>{pair.nameA}</b><span className="muted">and</span><b>{pair.nameB}</b></div>
                <div className="muted small">{pair.problem}</div>
                <div className={`score-bar ${tone(pair.score)}`}><span style={{ width: `${Math.round(pair.score * 100)}%` }} /></div>
                <div className="row between">
                  <span className={`score ${tone(pair.score)}`}>{Math.round(pair.score * 100)}% similar</span>
                  <span className="row" style={{ gap: '0.35rem' }}>
                    {pair.sameIp ? <span className="pill warn" title="Both submissions came from one network"><Wifi size={11} /> same network</span> : null}
                    <StatusPill status={pair.status === 'confirmed' ? 'blocked' : pair.status === 'dismissed' ? 'published' : 'checking'} label={pair.status} />
                  </span>
                </div>
              </button>
            ))}
          </aside>

          <section className="pair-detail">
            {!detail ? (
              <div className="box"><Empty icon={<ShieldAlert size={22} />} title={pairs.length ? 'Pick a pair to review' : 'Nothing to review'}>
                {pairs.length ? 'The two programs open side by side with the shared lines marked.' : null}
              </Empty></div>
            ) : (
              <div className="box">
                <header className="detail-head">
                  <div>
                    <h2>{detail.nameA} <span className="muted">and</span> {detail.nameB}</h2>
                    <div className="muted small">{detail.problem} · {detail.languageA}{detail.languageB !== detail.languageA ? ` / ${detail.languageB}` : ''}</div>
                  </div>
                  <div className={`score-ring ${tone(detail.score)}`} style={{ ['--p' as string]: `${Math.round(detail.score * 100)}` }}>
                    <b>{Math.round(detail.score * 100)}%</b>
                  </div>
                </header>
                <div className="detail-facts">
                  <span><Fingerprint size={13} /> {detail.shared.a.length} of {detail.codeA.replace(/\n$/, '').split('\n').length} lines in {detail.nameA}’s code are shared</span>
                  {detail.sameIp ? <span className="warn"><Wifi size={13} /> submitted from the same network</span> : <span className="muted"><Wifi size={13} /> different networks</span>}
                </div>
                <div className="code-compare">
                  <CodeColumn name={detail.nameA} code={detail.codeA} shared={detail.shared.a} />
                  <CodeColumn name={detail.nameB} code={detail.codeB} shared={detail.shared.b} />
                </div>
                <p className="muted small" style={{ margin: 'var(--space-2) var(--space-4) 0' }}>Marked lines belong to a run of 8 tokens that appears in both programs after names and numbers are normalised.</p>
                <div className="decision">
                  <label htmlFor="note" style={{ marginTop: 0 }}>Review note</label>
                  <textarea id="note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="what you checked, who you spoke to" />
                  <div className="row between" style={{ marginTop: 'var(--space-3)' }}>
                    <span className="muted small">
                      {detail.status === 'open' ? 'Not decided yet. A match alone is never a disqualification.' : `${detail.status} by ${detail.decidedBy ?? 'staff'}${detail.decidedAt ? `, ${formatWhen(detail.decidedAt)}` : ''}`}
                    </span>
                    <span className="row">
                      {detail.status !== 'open' ? <button className="btn ghost sm" type="button" disabled={busy} onClick={() => decide('open')}><RotateCcw size={13} /> reopen</button> : null}
                      <button className="btn" type="button" disabled={busy} onClick={() => decide('dismissed')}><X size={14} /> dismiss: not a copy</button>
                      <button className="btn danger" type="button" disabled={busy} onClick={() => decide('confirmed')}><Check size={14} /> confirm: copied</button>
                    </span>
                  </div>
                </div>
              </div>
            )}
            {detail ? <button className="btn ghost sm" type="button" style={{ marginTop: 'var(--space-2)' }} onClick={() => load().catch((err) => setError(errorText(err)))}><RefreshCw size={13} /> refresh list</button> : null}
          </section>
        </div>
      )}
    </div>
  );
}

function CodeColumn({ name, code, shared }: { name: string; code: string; shared: number[] }) {
  const marked = useMemo(() => new Set(shared), [shared]);
  const lines = code.replace(/\n$/, '').split('\n');
  return (
    <div className="code-col">
      <div className="code-col-head"><strong>{name}</strong><span className="muted small">{lines.length} lines</span></div>
      <pre>
        {lines.map((line, index) => (
          <div key={index} className={marked.has(index + 1) ? 'shared' : ''}><span className="ln">{index + 1}</span>{line || ' '}</div>
        ))}
      </pre>
    </div>
  );
}
