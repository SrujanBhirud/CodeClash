import { Link, useLocation } from 'react-router-dom';

export function Planned({
  path,
  title,
  role,
  when,
  summary,
  items,
}: {
  path: string;
  title: string;
  role: string;
  when: string;
  summary: string;
  items: string[];
}) {
  const { pathname } = useLocation();
  return (
    <div className="page narrow">
      <div className="terminal" style={{ marginTop: 'var(--space-6)' }}>
        <div className="terminal-top"><i /><i /><i /><span>planned</span></div>
        <pre>
          <span className="muted">$</span> cd {pathname}{'\n'}
          <span className="ok">planned</span> <span className="muted">· empty in this milestone</span>{'\n'}
          <span className="muted">  role</span>  {role}{'\n'}
          <span className="muted">  when</span>  {when}{'\n'}
          <span className="muted">$</span> <span className="cursor" />
        </pre>
      </div>
      <h1 style={{ margin: '1.5rem 0 0.5rem' }}>{title}</h1>
      <p className="muted">{summary}</p>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
      <p className="muted">This screen does not read or write that data yet. Practice submit and judging are on the problemset.</p>
      <div className="row">
        <Link className="btn primary" to="/problemset">go to the problemset</Link>
        <Link className="btn" to="/">home</Link>
      </div>
      <p className="muted small">Reserved path: {path}</p>
    </div>
  );
}
