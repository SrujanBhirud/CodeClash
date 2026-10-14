import { LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, loadSession, saveSession, SIGNED_OUT, type Session } from './api';
import { Auth } from './pages/Auth';
import { Home } from './pages/Home';
import { NotFound } from './pages/NotFound';
import { Planned } from './pages/Planned';
import { Practice } from './pages/Practice';
import { Profile } from './pages/Profile';
import { Problemset } from './pages/Problemset';
import { ThemePicker } from './ThemePicker';
import { Toaster } from './ui';

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession());
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => { saveSession(session); }, [session]);

  useEffect(() => {
    const expired = () => {
      setSession(null);
      navigate('/auth');
    };
    window.addEventListener(SIGNED_OUT, expired);
    return () => window.removeEventListener(SIGNED_OUT, expired);
  }, [navigate]);

  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  function signOut() {
    if (session) void api('/api/auth/logout', { method: 'POST', body: JSON.stringify({ refresh: session.refresh }) }).catch(() => {});
    setSession(null);
    navigate('/');
  }

  const unverified = session?.user.emailVerified === false;
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="header">
        <div className="header-in">
          <Link to="/" className="brand" aria-label="CodeClash home"><span className="brand-mark">&gt;_</span>codeclash</Link>
          <nav className="menu" aria-label="Main">
            <NavLink to="/problemset">problemset</NavLink>
            <NavLink to="/arena">contests</NavLink>
            <NavLink to="/authoring">authoring</NavLink>
            <NavLink to="/control">control</NavLink>
            <NavLink to="/admin">admin</NavLink>
          </nav>
          <div className="header-right">
            <ThemePicker />
            {session ? (
              <>
                <Link to="/profile" className="who" title="Profile">
                  <span className="avatar" aria-hidden>{(session.user.displayName ?? '?').slice(0, 1).toUpperCase()}</span>
                  <span className="name">{session.user.displayName ?? 'you'}</span>
                </Link>
                <button className="btn ghost icon sm" type="button" onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut size={15} /></button>
              </>
            ) : <Link className="btn primary sm" to="/auth">sign in</Link>}
          </div>
        </div>
      </header>
      {unverified ? (
        <div className="page" style={{ paddingBottom: 0 }}>
          <div className="alert warn" role="status">Confirm your email before you take a seat or submit. <Link to="/auth">Open the confirmation page</Link></div>
        </div>
      ) : null}
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Home signedIn={!!session} />} />
          <Route path="/auth" element={session && !unverified ? <Navigate to="/" /> : <Auth onSession={setSession} />} />
          <Route path="/problemset" element={<Problemset />} />
          <Route path="/practice/:versionId" element={<Practice signedIn={!!session} />} />
          <Route path="/profile" element={session ? <Profile session={session} /> : <Navigate to="/auth" />} />
          <Route path="/arena" element={<Planned path="/arena" title="Contests are reserved." role="participant" when="Sprint 2" summary="Registration, seats, the waitlist and the contest room land here. The page is empty so the milestone demo can point at the workflow without pretending a contest is running." items={['Create a contest and move it through its schedule.', 'Reserve a seat with one atomic update, then a first-in first-out waitlist.', 'Withdraw a seat and promote the next person in the same transaction.', 'Live standings come after the scoring engine.']} />} />
          <Route path="/arena/:id" element={<Planned path="/arena/:id" title="This contest room is reserved." role="participant" when="Sprint 2" summary="A contest page will hold the statement, the seat, and the standings. No contest id is loaded in this milestone." items={['Enter only with a reserved seat.', 'Submit contest solutions on the same judge as practice.', 'Show a frozen scoreboard before the organisers publish.']} />} />
          <Route path="/authoring" element={<Planned path="/authoring" title="Authoring is reserved." role="problem setter" when="Sprint 3" summary="Setters write problems here before the November demo. The screen is empty because those pages are not in the judge milestone." items={['Write a statement and keep each version immutable.', 'Upload tests, a reference solution, wrong solutions and per-language limits.', 'Publish only when the sandbox verdicts pass.', 'The test-hardening agent proposes extra tests later. A setter approves them. The agent cannot publish or change a score.']} />} />
          <Route path="/control" element={<Planned path="/control" title="Contest control is reserved." role="organiser" when="After the contest and scoring work" summary="Organisers run the event from here. Nothing on this screen can start, freeze or publish a contest yet." items={['Open and close registration on schedule.', 'Freeze the public standings and reveal them on publish.', 'Ratings update only after publish.']} />} />
          <Route path="/admin" element={<Planned path="/admin" title="Administration is reserved." role="administrator" when="Roles next, then the audit log" summary="The four roles and the append-only audit log are the administration surface. This page does not grant roles or search the log." items={['Enforce participant, setter, organiser and administrator on every route.', 'Write privileged actions to an append-only audit database.', 'Search of that log is a later, optional screen.']} />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Toaster />
    </>
  );
}

export { api };
