/** Setter flow: statement, tests, solutions, editorial, then the publish check. */
import { Bot, Check, CircleDashed, FilePlus2, FileUp, Globe, Lock, Plus, Save, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState, type DragEvent, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, isAbort } from '../api';
import { parseSamples, ProblemView, Statement } from '../problem';
import { Alert, Editor, Empty, errorText, formatWhen, LANGUAGES, StatusPill, toast, type Language } from '../ui';
import { Hardening } from './Hardening';

type Visibility = 'public' | 'private';
interface ProblemRow { problemId: string; versionId: string; version: number; title: string; status: string; visibility?: Visibility; listed?: boolean }
interface Test { input: string; output: string; hidden: boolean; group?: string }
interface Subtask { name: string; points: number }
interface Solution { label: string; language: Language; code: string }
interface Usage { visibility: Visibility; listed: boolean; usedIn: { id: string; title: string; status: string; startsAt: string }[] }
interface Version extends Partial<Usage> {
  problemId: string;
  versionId: string;
  version: number;
  title: string;
  statement: string;
  samples: string;
  editorial: string;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  subtasks: Subtask[];
  tests: Test[];
  reference: { language: Language; code: string } | null;
  wrongSolutions: Solution[];
  inputSpec: string;
  source: { name: string; url?: string; license?: string } | null;
  status: string;
  report: string[];
}
interface SpecCheck { ok: boolean; parseError: string | null; failures: { test: number; error: string }[]; checked: number; drafted: string | null }
type Section = 'statement' | 'tests' | 'solutions' | 'editorial' | 'check';

const EDITABLE = ['draft', 'blocked'];
const HELD = ['draft', 'registration_open', 'running', 'frozen', 'ended'];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function tagList(tags: unknown): string[] {
  const source = Array.isArray(tags) ? tags : [];
  return source.map((tag) => String(tag).trim()).filter(Boolean);
}

function readiness(version: Version) {
  const hidden = version.tests.filter((t) => t.hidden).length;
  const samples = version.samples.trim() ? parseSamples(version.samples).length : 0;
  return [
    { key: 'statement', section: 'statement', label: 'statement', done: version.statement.trim().length > 0, required: true },
    { key: 'samples', section: 'statement', label: samples ? `${samples} example${samples > 1 ? 's' : ''}` : 'examples', done: samples > 0, required: true },
    { key: 'tests', section: 'tests', label: version.tests.length ? `${version.tests.length} tests · ${hidden} hidden` : 'tests', done: version.tests.length > 0, required: true },
    { key: 'spec', section: 'tests', label: 'input spec', done: version.inputSpec.trim().length > 0, required: false },
    { key: 'reference', section: 'solutions', label: 'reference', done: !!version.reference?.code.trim(), required: true },
    { key: 'wrong', section: 'solutions', label: version.wrongSolutions.length ? `${version.wrongSolutions.length} wrong solution${version.wrongSolutions.length > 1 ? 's' : ''}` : 'wrong solutions', done: version.wrongSolutions.length > 0, required: false },
    { key: 'editorial', section: 'editorial', label: 'editorial', done: version.editorial.trim().length > 0, required: false },
  ] as const;
}

function whereText(version: Version) {
  const held = (version.usedIn ?? []).find((c) => HELD.includes(c.status));
  if (version.listed) return { tone: 'ok', text: 'Listed in the problemset now.' };
  if (version.status !== 'published' && version.version === 1) {
    return { tone: '', text: version.visibility === 'private' ? 'Contest only. It appears in the problemset after a contest using it is published.' : 'Joins the problemset once a version is published.' };
  }
  if (held) return { tone: 'warn', text: `Held out of the problemset while “${held.title}” is ${held.status.replace('_', ' ')}.` };
  if (version.visibility === 'private') return { tone: '', text: 'Contest only. It appears in the problemset after a contest using it is published.' };
  return { tone: '', text: 'Not in the problemset yet.' };
}

export function Authoring() {
  const [params, setParams] = useSearchParams();
  const versionId = params.get('v') ?? '';
  const [problems, setProblems] = useState<ProblemRow[]>([]);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [version, setVersion] = useState<Version | null>(null);
  const [dirty, setDirty] = useState(false);
  const [section, setSection] = useState<Section>('statement');
  const [hardenRequest, setHardenRequest] = useState(0);
  const [specCheck, setSpecCheck] = useState<SpecCheck | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newStatement, setNewStatement] = useState('');
  const [newTags, setNewTags] = useState('');
  const [newDifficulty, setNewDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy');
  const [newVisibility, setNewVisibility] = useState<Visibility>('private');
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [tagText, setTagText] = useState('');
  const [dragging, setDragging] = useState(false);

  const loadProblems = useCallback(() => api<ProblemRow[]>('/api/problems').then(setProblems), []);
  const loadVersion = useCallback(async (id: string, signal?: AbortSignal) => {
    if (!id) { setVersion(null); setTagText(''); return; }
    const next = await api<Version>(`/api/problem-versions/${id}`, { signal });
    if (signal?.aborted) return;
    setVersion({ ...next, tags: tagList(next.tags), inputSpec: next.inputSpec ?? '', editorial: next.editorial ?? '', samples: next.samples ?? '' });
    setTagText(tagList(next.tags).join(', '));
    setSpecCheck(null);
    setDirty(false);
  }, []);

  useEffect(() => { loadProblems().catch((e) => setError(errorText(e))); }, [loadProblems]);
  useEffect(() => {
    if (!creating) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setCreating(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [creating]);
  useEffect(() => {
    const controller = new AbortController();
    loadVersion(versionId, controller.signal).catch((e) => { if (!isAbort(e)) setError(errorText(e)); });
    return () => controller.abort();
  }, [versionId, loadVersion]);

  function select(id: string) {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    setError('');
    setParams(id ? { v: id } : {});
  }

  async function guarded(label: string, action: () => Promise<void>) {
    setError('');
    setWorking(label);
    try {
      await action();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setWorking('');
    }
  }

  function patch(change: Partial<Version>) {
    setVersion((current) => (current ? { ...current, ...change } : current));
    setDirty(true);
  }

  function onTags(value: string) {
    setTagText(value);
    patch({ tags: tagList(value.split(',')) });
  }

  async function createProblem(event: FormEvent) {
    event.preventDefault();
    await guarded('create', async () => {
      const created = await api<{ versionId: string }>('/api/problems', {
        method: 'POST',
        body: JSON.stringify({ title: newTitle, statement: newStatement, samples: '', tags: tagList(newTags.split(',')), difficulty: newDifficulty, visibility: newVisibility }),
      });
      setNewTitle('');
      setNewStatement('');
      setNewTags('');
      setCreating(false);
      await loadProblems();
      setDirty(false);
      setSection('statement');
      setParams({ v: created.versionId });
      toast('Problem created as a draft', 'ok');
    });
  }

  async function save() {
    if (!version) return false;
    return guarded('save', async () => {
      await api(`/api/problem-versions/${version.versionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: version.title, statement: version.statement, samples: version.samples, editorial: version.editorial, tags: version.tags, difficulty: version.difficulty, inputSpec: version.inputSpec }),
      });
      await api(`/api/problem-versions/${version.versionId}/tests`, {
        method: 'PUT',
        body: JSON.stringify({ tests: version.tests, subtasks: version.subtasks ?? [], reference: version.reference, wrongSolutions: version.wrongSolutions }),
      });
      await Promise.all([loadVersion(version.versionId), loadProblems()]);
      toast('Saved', 'ok');
    });
  }

  async function setVisibility(next: Visibility) {
    if (!version || version.visibility === next) return;
    await guarded('visibility', async () => {
      const usage = await api<Usage>(`/api/problems/${version.problemId}/visibility`, { method: 'PUT', body: JSON.stringify({ visibility: next }) });
      setVersion((current) => (current ? { ...current, ...usage } : current));
      await loadProblems();
      toast(next === 'private' ? 'Contest only: kept out of the problemset' : 'Public: listed once published', 'ok');
    });
  }

  async function uploadZip(file: File) {
    if (!version) return;
    if (!file.name.toLowerCase().endsWith('.zip')) { setError('That is not a .zip file.'); return; }
    if (dirty && !(await save())) return;
    await guarded('zip', async () => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      bytes.forEach((b) => { binary += String.fromCharCode(b); });
      const result = await api<{ count: number }>(`/api/problem-versions/${version.versionId}/tests-zip`, {
        method: 'POST',
        body: JSON.stringify({ zipBase64: btoa(binary) }),
      });
      await loadVersion(version.versionId);
      toast(`Loaded ${result.count} tests from ${file.name}`, 'ok');
    });
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file && editable) void uploadZip(file);
  }

  async function publishCheck() {
    if (!version || !(await save())) return;
    await guarded('check', async () => {
      await api(`/api/problem-versions/${version.versionId}/publish-check`, { method: 'POST' });
      setVersion((current) => (current ? { ...current, status: 'checking', report: [] } : current));
      for (let i = 0; i < 120; i += 1) {
        await sleep(1500);
        const next = await api<Version>(`/api/problem-versions/${version.versionId}`);
        if (next.status !== 'checking') {
          setVersion({ ...next, tags: tagList(next.tags), inputSpec: next.inputSpec ?? '', editorial: next.editorial ?? '', samples: next.samples ?? '' });
          await loadProblems();
          toast(next.status === 'published' ? 'Published. Contests and practice now use this version.' : 'The check blocked this version. See the report.', next.status === 'published' ? 'ok' : 'bad');
          return;
        }
      }
      toast('The check is still running. Reload later.', 'warn');
    });
  }

  async function approved(nextVersionId: string) {
    await loadProblems();
    setDirty(false);
    if (nextVersionId === versionId) await loadVersion(nextVersionId);
    else setParams({ v: nextVersionId });
  }

  async function checkSpec() {
    if (!version) return;
    await guarded('spec', async () => {
      setSpecCheck(await api<SpecCheck>(`/api/problem-versions/${version.versionId}/spec-check`, {
        method: 'POST',
        body: JSON.stringify({ inputSpec: version.inputSpec }),
      }));
    });
  }

  async function newVersion() {
    if (!version) return;
    await guarded('version', async () => {
      const created = await api<{ versionId: string }>(`/api/problems/${version.problemId}/versions`, { method: 'POST', body: '{}' });
      await loadProblems();
      setParams({ v: created.versionId });
      toast('New draft version created', 'ok');
    });
  }

  const editable = version ? EDITABLE.includes(version.status) : false;
  const shown = problems.filter((p) => p.title.toLowerCase().includes(filter.toLowerCase()) && (!statusFilter || p.status === statusFilter));
  const ready = version ? readiness(version) : [];
  const missing = ready.filter((item) => item.required && !item.done);
  const stepDone = (key: Section) => {
    const items = ready.filter((item) => item.section === key);
    return items.length > 0 && items.every((item) => item.done || !item.required) && items.some((item) => item.done);
  };
  const sampleTests = version?.tests.filter((t) => !t.hidden).length ?? 0;
  const groups = new Set(version?.tests.map((t) => t.group).filter(Boolean)).size;

  return (
    <div className="page wide author-page">
      <div className="page-head">
        <div>
          <h1>Authoring</h1>
          <p>Draft a problem, prove it in the sandbox, then publish.</p>
        </div>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      <div className="author">
        <div className="author-switch">
          <div className="input-icon">
            <Search size={14} />
            <input aria-label="Filter problems" placeholder="Find a problem" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <select aria-label="Open problem" value={creating ? '' : versionId} onChange={(e) => { setCreating(false); select(e.target.value); }}>
            <option value="" disabled>{shown.length === 0 ? 'No matches' : `${shown.length} problems`}</option>
            {shown.map((p) => <option key={p.versionId} value={p.versionId}>{p.title} · v{p.version} · {p.status}{p.visibility === 'private' ? ' · private' : ''}</option>)}
          </select>
          <div className="row" role="group" aria-label="Filter by status">
            {['', 'draft', 'blocked', 'published'].map((item) => (
              <button key={item || 'all'} type="button" className={`chip ${statusFilter === item ? 'on' : ''}`} onClick={() => setStatusFilter(item)}>{item || 'all'}</button>
            ))}
          </div>
          <button className="btn" type="button" onClick={() => setCreating(true)}><FilePlus2 size={14} /> new problem</button>
        </div>

        <section className="author-main">
          {creating ? (
            <form className="box author-work" onSubmit={createProblem}>
              <header className="box-head">
                <strong>new problem</strong>
                <button className="btn ghost icon sm" type="button" onClick={() => setCreating(false)} aria-label="Close"><X size={14} /></button>
              </header>
              <div className="author-body">
                <label htmlFor="new-title" style={{ marginTop: 0 }}>Title</label>
                <input id="new-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required autoFocus placeholder="Sum of two integers" />
                <label>Visibility</label>
                <div className="visibility-pick" role="radiogroup" aria-label="Visibility">
                  <button type="button" role="radio" aria-checked={newVisibility === 'private'} className={newVisibility === 'private' ? 'on' : ''} onClick={() => setNewVisibility('private')}>
                    <Lock size={16} /><strong>Private</strong><span>Contest only. Joins the problemset after a contest using it is published.</span>
                  </button>
                  <button type="button" role="radio" aria-checked={newVisibility === 'public'} className={newVisibility === 'public' ? 'on' : ''} onClick={() => setNewVisibility('public')}>
                    <Globe size={16} /><strong>Public</strong><span>In the problemset for practice as soon as it is published.</span>
                  </button>
                </div>
                <div className="field-row">
                  <div>
                    <label>Difficulty</label>
                    <div className="segmented" role="radiogroup" aria-label="Difficulty">
                      {(['easy', 'medium', 'hard'] as const).map((level) => (
                        <button key={level} type="button" role="radio" aria-checked={newDifficulty === level} className={newDifficulty === level ? 'on' : ''} onClick={() => setNewDifficulty(level)}>{level}</button>
                      ))}
                    </div>
                  </div>
                  <div><label htmlFor="new-tags">Tags (comma separated)</label><input id="new-tags" value={newTags} onChange={(e) => setNewTags(e.target.value)} placeholder="math, implementation" /></div>
                </div>
                <label htmlFor="new-statement">Statement</label>
                <textarea id="new-statement" className="prose" value={newStatement} onChange={(e) => setNewStatement(e.target.value)} required placeholder="Read two integers and print their sum." style={{ minHeight: '14rem' }} />
                <div className="create-actions">
                  <span className="muted small grow">Examples, tests and solutions come next. <kbd>Esc</kbd> closes.</span>
                  <button className="btn ghost" type="button" onClick={() => setCreating(false)}>cancel</button>
                  <button className="btn primary" type="submit" disabled={working !== ''}><FilePlus2 size={14} /> {working === 'create' ? 'creating…' : 'create draft'}</button>
                </div>
              </div>
            </form>
          ) : !version ? (
            <div className="box author-work">
              <header className="box-head"><strong>editor</strong></header>
              <div className="author-body empty-file">
                <Empty icon={<FilePlus2 size={28} />} title="Nothing open">
                  Pick a problem from the list, or use new problem in the sidebar.
                </Empty>
              </div>
            </div>
          ) : (
            <div className="box author-work">
              <header className="box-head">
                <strong>{version.title}</strong>
                <span className="row">
                  <span className="muted small">v{version.version}</span>
                  <StatusPill status={version.status} label={version.status} />
                  {dirty ? <span className="pill warn">unsaved</span> : null}
                  {!editable && version.status !== 'checking' ? <button className="btn sm" type="button" onClick={newVersion} disabled={working !== ''}><Plus size={14} /> new version</button> : null}
                  <button className="btn primary sm" type="button" disabled={!editable || working !== '' || !dirty} onClick={save}><Save size={14} /> {working === 'save' ? 'saving…' : 'save'}</button>
                </span>
              </header>

              <div className="where">
                <div className="segmented" role="radiogroup" aria-label="Visibility">
                  <button type="button" role="radio" aria-checked={version.visibility === 'private'} className={version.visibility === 'private' ? 'on' : ''} disabled={working !== ''} onClick={() => setVisibility('private')}><Lock size={13} /> private</button>
                  <button type="button" role="radio" aria-checked={version.visibility !== 'private'} className={version.visibility !== 'private' ? 'on' : ''} disabled={working !== ''} onClick={() => setVisibility('public')}><Globe size={13} /> public</button>
                </div>
                <span className={`small where-text ${whereText(version).tone}`}>{whereText(version).text}</span>
                {(version.usedIn ?? []).length > 0 ? (
                  <span className="small muted where-used">
                    used in {(version.usedIn ?? []).slice(0, 3).map((c, index) => (
                      <span key={c.id}>{index ? ', ' : ''}<Link to={`/arena/${c.id}`} title={formatWhen(c.startsAt)}>{c.title}</Link> <span className="muted">({c.status.replace('_', ' ')})</span></span>
                    ))}{(version.usedIn ?? []).length > 3 ? ` and ${(version.usedIn ?? []).length - 3} more` : ''}
                  </span>
                ) : null}
              </div>

              <div className="readiness" aria-label="Ready to publish">
                {ready.map((item) => (
                  <button key={item.key} type="button" className={`ready-item ${item.done ? 'done' : item.required ? 'todo' : 'optional'}`} onClick={() => setSection(item.section)} title={item.required ? 'needed to publish' : 'recommended'}>
                    {item.done ? <Check size={12} /> : <CircleDashed size={12} />} {item.label}
                  </button>
                ))}
              </div>

              <nav className="steps-nav" role="tablist" aria-label="Authoring steps">
                {([
                  ['statement', 'Statement'],
                  ['tests', 'Tests'],
                  ['solutions', 'Solutions'],
                  ['editorial', 'Editorial'],
                  ['check', 'Check & harden'],
                ] as const).map(([key, name], index) => (
                  <button key={key} type="button" role="tab" aria-selected={section === key} className={`step-tab ${section === key ? 'on' : ''} ${key !== 'check' && stepDone(key) ? 'done' : ''}`} onClick={() => setSection(key)}>
                    <span className="num">{key !== 'check' && stepDone(key) ? <Check size={11} /> : index + 1}</span> {name}
                  </button>
                ))}
              </nav>
              {version.report.length > 0 ? (
                <Alert tone={version.status === 'published' ? 'ok' : 'bad'}>
                  <strong>{version.status === 'published' ? 'Publish check passed' : 'Publish check blocked this version'}</strong>
                  <ul>{version.report.map((line) => <li key={line}>{line}</li>)}</ul>
                </Alert>
              ) : null}
              {!editable ? <Alert tone="info">This version is {version.status} and cannot change. {version.status !== 'checking' ? 'Start a new version to edit it.' : 'Wait for the check to finish.'}</Alert> : null}
              <div className="author-body">

              {section === 'statement' ? (
                <div className="two">
                  <fieldset disabled={!editable || working !== ''}>
                      <div className="field-row">
                        <div><label htmlFor="title" style={{ marginTop: 0 }}>Title</label><input id="title" value={version.title} onChange={(e) => patch({ title: e.target.value })} /></div>
                        <div><label htmlFor="tags" style={{ marginTop: 0 }}>Tags (comma separated)</label><input id="tags" value={tagText} onChange={(e) => onTags(e.target.value)} /></div>
                        <div>
                          <label style={{ marginTop: 0 }}>Difficulty</label>
                          <div className="segmented" role="radiogroup" aria-label="Difficulty">
                            {(['easy', 'medium', 'hard'] as const).map((level) => (
                              <button key={level} type="button" role="radio" aria-checked={(version.difficulty ?? 'medium') === level} className={(version.difficulty ?? 'medium') === level ? 'on' : ''} onClick={() => patch({ difficulty: level })}>{level}</button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <label htmlFor="statement">Statement</label>
                      <p className="hint">Blank lines split paragraphs. A line that says Input, Output or Note starts a section. Wrap code in backticks: `n`.</p>
                      <textarea id="statement" className="prose" value={version.statement} onChange={(e) => patch({ statement: e.target.value })} style={{ minHeight: '16rem' }} />
                      <SamplesEditor key={version.versionId} text={version.samples} onChange={(samples) => patch({ samples })} />
                  </fieldset>
                  <div>
                    <p className="label" style={{ marginTop: 0 }}>Preview · how participants see it</p>
                    <ProblemView problem={{ ...version, editorial: '' }} language="python" />
                  </div>
                </div>
              ) : null}

              <fieldset disabled={!editable || working !== ''}>
                {section === 'tests' ? (
                  <>
                    <div className="test-summary">
                      <div><b>{version.tests.length}</b><span>tests</span></div>
                      <div><b>{sampleTests}</b><span>visible</span></div>
                      <div><b>{version.tests.length - sampleTests}</b><span>hidden</span></div>
                      <div><b>{groups}</b><span>subtasks used</span></div>
                    </div>
                    <div
                      className={`dropzone ${dragging ? 'over' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={onDrop}
                    >
                      <FileUp size={22} />
                      <div className="grow">
                        <strong>{working === 'zip' ? 'reading the zip…' : 'Drop a tests zip here'}</strong>
                        <span className="small muted">Pairs of <code>name.in</code> + <code>name.out</code>, in any folder. Files starting with <code>sample</code> stay visible; the rest are hidden. The zip replaces the current tests.</span>
                      </div>
                      <label className="btn sm file" style={{ margin: 0 }}>
                        choose file
                        <input type="file" accept=".zip" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadZip(file); e.target.value = ''; }} />
                      </label>
                      <button className="btn sm" type="button" onClick={() => patch({ tests: [...version.tests, { input: '', output: '', hidden: true, group: '' }] })}><Plus size={14} /> add by hand</button>
                    </div>
                    {version.tests.length === 0 ? <div className="table-wrap"><Empty title="No tests yet">Drop a zip above or add tests by hand.</Empty></div> : (
                      <div className="test-list">
                        {version.tests.map((test, index) => (
                          <div key={index} className={`test-item ${test.hidden ? '' : 'visible'}`}>
                            <span className="idx num">#{index + 1}{test.hidden ? '' : <span className="pill accent">visible</span>}</span>
                            <textarea aria-label={`Test ${index + 1} input`} placeholder="input" value={test.input} onChange={(e) => patch({ tests: version.tests.map((t, i) => (i === index ? { ...t, input: e.target.value } : t)) })} />
                            <textarea aria-label={`Test ${index + 1} output`} placeholder="expected output" value={test.output} onChange={(e) => patch({ tests: version.tests.map((t, i) => (i === index ? { ...t, output: e.target.value } : t)) })} />
                            <div className="stack tight">
                              <input aria-label={`Test ${index + 1} subtask`} placeholder="subtask" value={test.group ?? ''} onChange={(e) => patch({ tests: version.tests.map((t, i) => (i === index ? { ...t, group: e.target.value } : t)) })} />
                              <label className="check"><input type="checkbox" checked={test.hidden} onChange={(e) => patch({ tests: version.tests.map((t, i) => (i === index ? { ...t, hidden: e.target.checked } : t)) })} /> hidden</label>
                              <button className="btn danger sm" type="button" onClick={() => patch({ tests: version.tests.filter((_, i) => i !== index) })} aria-label={`Remove test ${index + 1}`}><Trash2 size={13} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="two" style={{ marginTop: 'var(--space-5)' }}>
                      <div>
                        <label htmlFor="spec" style={{ marginTop: 0 }}>Input spec · one line per input line</label>
                        <textarea
                          id="spec"
                          className="mono-area"
                          spellCheck={false}
                          value={version.inputSpec}
                          onChange={(e) => { patch({ inputSpec: e.target.value }); setSpecCheck(null); }}
                          placeholder={'n int 1..2*10^5\na int[n] -10^9..10^9'}
                          style={{ minHeight: '10rem' }}
                        />
                        <div className="row" style={{ marginTop: 'var(--space-2)' }}>
                          <button className="btn sm" type="button" onClick={checkSpec} disabled={working !== ''}><ShieldCheck size={14} /> {working === 'spec' ? 'checking…' : 'check against tests'}</button>
                          {specCheck?.drafted && specCheck.drafted !== version.inputSpec.trim() ? (
                            <button className="btn ghost sm" type="button" onClick={() => { patch({ inputSpec: specCheck.drafted! }); setSpecCheck(null); }}>use the spec drafted from the statement</button>
                          ) : null}
                        </div>
                        {specCheck ? (
                          specCheck.parseError ? <Alert tone="bad">{specCheck.parseError}</Alert>
                            : specCheck.ok ? <Alert tone="ok">All {specCheck.checked} tests are valid under this spec.</Alert>
                              : (
                                <Alert tone="bad">
                                  <strong>{specCheck.failures.length} test(s) break this spec</strong>
                                  <ul>{specCheck.failures.map((f) => <li key={f.test}>test #{f.test}: {f.error}</li>)}</ul>
                                </Alert>
                              )
                        ) : null}
                      </div>
                      <div className="spec-help small">
                        <p className="label" style={{ marginTop: 0 }}>Syntax</p>
                        <pre>{[
                          'n int 1..2*10^5, k int 0..n   one line, two integers',
                          'a int[n] -10^9..10^9          n integers on one line',
                          's str[1..n] a-z               a string and its alphabet',
                          'lines n-1: u int 1..n, v int 1..n',
                          't int 1..10^4',
                          'repeat t:                     the indented block, t times',
                          '  n int 1..10^5',
                          'sum n <= 2*10^5               over all repeats',
                        ].join('\n')}</pre>
                        <p className="muted">
                          Hardening checks every input it makes against this spec before running it, and uses the bounds to build edge cases.
                          Without one, it drafts a spec from the statement and keeps it only if every current test fits.
                        </p>
                      </div>
                    </div>

                    <div className="row between" style={{ marginTop: 'var(--space-5)' }}>
                      <p className="section-title" style={{ margin: 0 }}>Subtasks <span className="muted small">· a group scores only if every test in it passes</span></p>
                      <button className="btn sm" type="button" onClick={() => patch({ subtasks: [...(version.subtasks ?? []), { name: '', points: 10 }] })}><Plus size={14} /> add subtask</button>
                    </div>
                    {(version.subtasks ?? []).length === 0 ? <p className="muted small">None. The problem is scored all or nothing.</p> : null}
                    {(version.subtasks ?? []).map((subtask, index) => (
                      <div key={index} className="field-row">
                        <div><label>Name</label><input aria-label={`Subtask ${index + 1} name`} value={subtask.name} onChange={(e) => patch({ subtasks: version.subtasks.map((s, i) => (i === index ? { ...s, name: e.target.value } : s)) })} /></div>
                        <div><label>Points</label><input aria-label={`Subtask ${index + 1} points`} type="number" min={1} value={subtask.points} onChange={(e) => patch({ subtasks: version.subtasks.map((s, i) => (i === index ? { ...s, points: Number(e.target.value) } : s)) })} /></div>
                        <div style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn danger sm" type="button" aria-label={`Remove subtask ${index + 1}`} onClick={() => patch({ subtasks: version.subtasks.filter((_, i) => i !== index) })}><Trash2 size={13} /></button></div>
                      </div>
                    ))}
                  </>
                ) : null}

                {section === 'solutions' ? (
                  <>
                    <div className="solution-intro">
                      <div><strong>Reference</strong><span>The correct answer key. It must pass every test, and its output becomes the expected output of every new test.</span></div>
                      <div><strong>Wrong solutions</strong><span>Believable mistakes. Each one must fail at least one test, so the publish check proves the tests can tell them apart.</span></div>
                    </div>
                    <p className="section-title" style={{ marginTop: 0 }}>Reference solution</p>
                    <SolutionEditor
                      value={{ label: 'reference', ...(version.reference ?? { language: 'python', code: '' }) }}
                      readOnly={!editable}
                      onChange={(next) => patch({ reference: { language: next.language, code: next.code } })}
                    />
                    <div className="row between">
                      <p className="section-title">Wrong solutions <span className="muted small">· {version.wrongSolutions.length}</span></p>
                      <button className="btn sm" type="button" onClick={() => patch({ wrongSolutions: [...version.wrongSolutions, { label: `wrong-${version.wrongSolutions.length + 1}`, language: 'python', code: '' }] })}><Plus size={14} /> add</button>
                    </div>
                    {version.wrongSolutions.length === 0 ? <p className="muted small">None yet. Hardening can propose some.</p> : null}
                    {version.wrongSolutions.map((solution, index) => (
                      <SolutionEditor
                        key={index}
                        value={solution}
                        withLabel
                        readOnly={!editable}
                        onChange={(next) => patch({ wrongSolutions: version.wrongSolutions.map((s, i) => (i === index ? next : s)) })}
                        onRemove={() => patch({ wrongSolutions: version.wrongSolutions.filter((_, i) => i !== index) })}
                      />
                    ))}
                  </>
                ) : null}

                {section === 'editorial' ? (
                  <div className="two">
                    <div>
                      <label htmlFor="editorial" style={{ marginTop: 0 }}>Editorial</label>
                      <p className="hint">Shown to participants after the contest ends, and on the problemset page. Same formatting as the statement.</p>
                      <textarea id="editorial" className="prose" value={version.editorial} onChange={(e) => patch({ editorial: e.target.value })} style={{ minHeight: '20rem' }} placeholder="The key observation is…" />
                    </div>
                    <div>
                      <p className="label" style={{ marginTop: 0 }}>Preview</p>
                      <div className="editorial-preview">
                        {version.editorial.trim() ? <Statement text={version.editorial} /> : <p className="muted small" style={{ margin: 0 }}>Nothing written yet. The editorial is optional.</p>}
                      </div>
                    </div>
                  </div>
                ) : null}
              </fieldset>

              {section === 'check' ? (
                <div className="stack">
                  <div className="check-card">
                    <div className="check-card-head"><ShieldCheck size={18} /><strong>Publish check</strong></div>
                    <p className="small muted">Runs the reference and every wrong solution against every test in the sandbox. It publishes only if the reference passes all of them and each wrong solution fails at least one.</p>
                    {missing.length > 0 && editable ? <p className="small" style={{ color: 'var(--warn)' }}>Still needed: {missing.map((m) => m.label).join(', ')}.</p> : null}
                    <button className="btn primary" type="button" disabled={!editable || missing.length > 0 || working !== ''} onClick={publishCheck}>
                      <ShieldCheck size={14} /> {working === 'check' || version.status === 'checking' ? 'checking in sandbox…' : 'run publish check'}
                    </button>
                  </div>
                  <div className="check-card-head" style={{ marginTop: 'var(--space-3)' }}>
                    <Bot size={18} /><strong>Test hardening</strong>
                    <span className="muted small">· finds the bugs your tests would let through, then proposes tests that catch them</span>
                  </div>
                  <Hardening
                    problemId={version.problemId}
                    versionId={version.versionId}
                    hasReference={!!version.reference?.code.trim() && version.tests.length > 0}
                    startRequest={hardenRequest}
                    onStartHandled={() => setHardenRequest(0)}
                    beforeStart={async () => (dirty && editable ? save() : true)}
                    onApproved={(id) => { void approved(id); }}
                    onDraftSpec={(spec) => { patch({ inputSpec: spec }); setSection('tests'); }}
                  />
                </div>
              ) : null}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function serialiseSamples(pairs: { input: string; output: string }[]) {
  return pairs.filter((p) => p.input.trim() || p.output.trim()).map((p) => `Input\n${p.input.replace(/\n+$/, '')}\nOutput\n${p.output.replace(/\n+$/, '')}`).join('\n\n');
}

function SamplesEditor({ text, onChange }: { text: string; onChange: (text: string) => void }) {
  const [pairs, setPairs] = useState(() => (text.trim() ? parseSamples(text) : [{ input: '', output: '' }]));
  const update = (next: { input: string; output: string }[]) => { setPairs(next); onChange(serialiseSamples(next)); };
  return (
    <div className="samples-editor">
      <div className="row between">
        <label style={{ margin: 0 }}>Examples · shown under the statement</label>
        <button className="btn sm" type="button" onClick={() => update([...pairs, { input: '', output: '' }])}><Plus size={14} /> add example</button>
      </div>
      {pairs.map((pair, index) => (
        <div key={index} className="sample-pair">
          <span className="muted small num">{index + 1}</span>
          <textarea aria-label={`Example ${index + 1} input`} className="mono-area" spellCheck={false} placeholder="input" value={pair.input} onChange={(e) => update(pairs.map((p, i) => (i === index ? { ...p, input: e.target.value } : p)))} />
          <textarea aria-label={`Example ${index + 1} output`} className="mono-area" spellCheck={false} placeholder="output" value={pair.output} onChange={(e) => update(pairs.map((p, i) => (i === index ? { ...p, output: e.target.value } : p)))} />
          <button className="btn danger sm" type="button" aria-label={`Remove example ${index + 1}`} onClick={() => update(pairs.filter((_, i) => i !== index))}><Trash2 size={13} /></button>
        </div>
      ))}
    </div>
  );
}

function SolutionEditor({ value, onChange, withLabel, readOnly, onRemove }: {
  value: Solution;
  onChange: (next: Solution) => void;
  withLabel?: boolean;
  readOnly?: boolean;
  onRemove?: () => void;
}) {
  return (
    <div className="solution">
      <div className="solution-head">
        {withLabel ? <input aria-label="Label" value={value.label} onChange={(e) => onChange({ ...value, label: e.target.value })} style={{ maxWidth: '16rem' }} placeholder="what mistake it makes" /> : <strong className="small">reference</strong>}
        <select aria-label="Language" value={value.language} onChange={(e) => onChange({ ...value, language: e.target.value as Language })}>
          {LANGUAGES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <span className="grow" />
        {onRemove ? <button className="btn danger sm" type="button" onClick={onRemove} aria-label={`Remove ${value.label}`}><Trash2 size={13} /></button> : null}
      </div>
      <Editor language={value.language} value={value.code} onChange={(code) => onChange({ ...value, code })} height="240px" readOnly={readOnly} />
    </div>
  );
}
