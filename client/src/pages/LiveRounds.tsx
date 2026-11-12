import { Activity, ArrowRight, Hourglass, Inbox, Trophy, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Empty, errorText, formatLeft, letter, StatusPill, useNow } from '../ui';

interface LiveContest {
  id: string;
  title: string;
  type: string;
  status: string;
  scoringMode: string;
  startsAt: string;
  freezeAt: string;
  endsAt: string;
  capacity: number;
  competing: number;
  waitlisted: number;
  submissions: number;
  accepted: number;
  pending: number;
  lastFiveMinutes: number;
  lastSubmissionAt: string | null;
  problems: { problemId: string; title: string; attempts: number; accepted: number }[];
  leaders: { displayName: string; solved: number; penalty: number; points: number | null }[];
}

/** Running and frozen contests, refreshed every five seconds. `only` limits the list to contests using these problems. */
export function LiveRounds({ only, compact = false }: { only?: string[]; compact?: boolean }) {
  const [rows, setRows] = useState<LiveContest[] | null>(null);
  const [skew, setSkew] = useState(0);
  const [error, setError] = useState('');
  const now = useNow() + skew;

  useEffect(() => {
    let stop = false;
    const load = () => api<{ serverNow: string; contests: LiveContest[] }>('/api/control/live')
      .then((data) => {
        if (stop) return;
        setSkew(new Date(data.serverNow).getTime() - Date.now());
        setRows(data.contests);
        setError('');
      })
      .catch((err) => { if (!stop) setError(errorText(err)); });
    void load();
    const timer = window.setInterval(load, 5000);
    return () => { stop = true; window.clearInterval(timer); };
  }, []);

  if (error && !rows) return <p className="muted small">{error}</p>;
  if (!rows) return <div className="skeleton" style={{ height: compact ? '5rem' : '12rem' }} />;
  const shown = only ? rows.filter((row) => row.problems.some((p) => only.includes(p.problemId))) : rows;
  if (shown.length === 0) {
    return compact ? null : <Empty icon={<Activity size={20} />} title="Nothing is live">Running and frozen contests appear here with their clock, seats and judge traffic.</Empty>;
  }
  return (
    <div className={`live-grid${compact ? ' compact' : ''}`}>
      {shown.map((contest) => <LiveCard key={contest.id} contest={contest} now={now} compact={compact} highlight={only} />)}
    </div>
  );
}

function LiveCard({ contest, now, compact, highlight }: { contest: LiveContest; now: number; compact: boolean; highlight?: string[] }) {
  const start = new Date(contest.startsAt).getTime();
  const end = new Date(contest.endsAt).getTime();
  const freeze = new Date(contest.freezeAt).getTime();
  const span = Math.max(1, end - start);
  const elapsed = Math.max(0, Math.min(100, ((now - start) / span) * 100));
  const freezeAt = Math.max(0, Math.min(100, ((freeze - start) / span) * 100));
  const frozen = contest.status === 'frozen' || now >= freeze;
  const rate = contest.submissions ? Math.round((100 * contest.accepted) / contest.submissions) : null;
  return (
    <article className={`live-card ${contest.status}`}>
      <header className="live-head">
        <div className="grow">
          <Link className="row-link" to={`/arena/${contest.id}`}><strong>{contest.title}</strong></Link>
          <div className="muted small">{contest.type} · {contest.scoringMode.toUpperCase()}</div>
        </div>
        <StatusPill status={contest.status} />
      </header>

      <div className="live-clock">
        <div>
          <span className="muted small">{frozen ? 'ends in' : 'board freezes in'}</span>
          <b className="clock num">{formatLeft((frozen ? end : freeze) - now)}</b>
        </div>
        {!frozen ? <span className="muted small num">ends in {formatLeft(end - now)}</span> : <span className="pill frozen">board frozen</span>}
      </div>
      <div className="timeline" role="img" aria-label={`${Math.round(elapsed)}% of the contest has passed`}>
        <span className="elapsed" style={{ width: `${elapsed}%` }} />
        <i className="freeze-mark" style={{ left: `${freezeAt}%` }} title="freeze" />
      </div>

      <div className="live-metrics">
        <div><Users size={14} /><b className="num">{contest.competing}</b><span>/ {contest.capacity} seats{contest.waitlisted ? ` · ${contest.waitlisted} waiting` : ''}</span></div>
        <div><Activity size={14} /><b className="num">{contest.lastFiveMinutes}</b><span>submissions, last 5 min</span></div>
        <div className={contest.pending ? 'warn' : ''}><Hourglass size={14} /><b className="num">{contest.pending}</b><span>in the judge queue</span></div>
        <div><Inbox size={14} /><b className="num">{contest.submissions}</b><span>total{rate !== null ? ` · ${rate}% accepted` : ''}</span></div>
      </div>

      {!compact && contest.problems.length ? (
        <div className="problem-bars">
          {contest.problems.map((problem, index) => {
            const share = problem.attempts ? (100 * problem.accepted) / problem.attempts : 0;
            return (
              <div key={problem.problemId} className={highlight?.includes(problem.problemId) ? 'mine' : ''} title={`${problem.title}: ${problem.accepted} accepted of ${problem.attempts}`}>
                <span className="letter">{letter(index)}</span>
                <span className="grow name">{problem.title}</span>
                <span className="bar ok"><span style={{ width: `${share}%` }} /></span>
                <span className="num small">{problem.accepted}/{problem.attempts}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {!compact ? (
        <ol className="leaders">
          {contest.leaders.length === 0 ? <li className="muted small">No accepted solution yet.</li> : contest.leaders.map((leader, index) => (
            <li key={`${leader.displayName}-${index}`}>
              <span className={`rank r${index + 1}`}>{index === 0 ? <Trophy size={12} /> : index + 1}</span>
              <span className="grow">{leader.displayName}</span>
              <span className="num small">{leader.points !== null ? `${leader.points} pts` : `${leader.solved} solved · ${leader.penalty}`}</span>
            </li>
          ))}
        </ol>
      ) : null}

      <footer className="row" style={{ justifyContent: 'flex-end' }}>
        <Link className="btn sm" to={`/arena/${contest.id}?tab=standings`}>standings</Link>
        <Link className="btn primary sm" to={`/arena/${contest.id}`}>open room <ArrowRight size={13} /></Link>
      </footer>
    </article>
  );
}
