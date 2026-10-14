import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Session } from '../api';
import { Alert, Box, errorText } from '../ui';

interface Me {
  id: string;
  role: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  rating: number;
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'administrator',
  organiser: 'organiser',
  setter: 'problem setter',
  participant: 'participant',
};

export function Profile({ session }: { session: Session }) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Me>('/api/me').then(setMe).catch((e) => setError(errorText(e)));
  }, []);

  const rating = me?.rating ?? session.user.rating ?? 1200;
  const delta = rating - 1200;
  const role = ROLE_LABEL[me?.role ?? session.user.role] ?? me?.role ?? session.user.role;

  return (
    <div className="page profile-page">
      <div className="page-head">
        <div>
          <h1>Profile</h1>
          <p>{me?.email ?? 'Your account'} · {role}</p>
        </div>
      </div>
      {error ? <Alert>{error}</Alert> : null}

      <div className="profile-grid">
        <Box title="rating">
          <div className="rating-hero">
            <b className="num">{rating}</b>
            <span className={delta >= 0 ? 'ok' : 'bad'}>{delta >= 0 ? '+' : ''}{delta}</span>
          </div>
          <div className="rate-track" aria-hidden>
            <span style={{ width: `${Math.max(6, Math.min(100, ((rating - 100) / 2300) * 100))}%` }} />
            <i style={{ left: `${((1200 - 100) / 2300) * 100}%` }} />
          </div>
          <p className="muted small">New accounts start at 1200. The mark on the bar is that start. Contest rating moves only after an organiser publishes results, which is a later step.</p>
        </Box>

        <Box title="streak">
          <div className="rating-hero">
            <b className="num">—</b>
            <span className="muted">not counted yet</span>
          </div>
          <div className="heat" aria-hidden>
            {Array.from({ length: 16 * 7 }, (_, index) => <i key={index} />)}
          </div>
          <p className="muted small">A day will fill in when an accepted solution is recorded. That history is not stored in this milestone, so the grid stays empty on purpose.</p>
        </Box>

        <Box title="name">
          <label htmlFor="display-name">Shown on standings</label>
          <input id="display-name" value={me?.displayName ?? session.user.displayName ?? ''} readOnly />
          <p className="muted small">The name is the one stored on the account. Editing it, and changing the password, arrive with the profile step. This milestone only reads them.</p>
        </Box>

        <Box title="account">
          <p>Email {me?.emailVerified === false ? 'is not confirmed yet' : 'is confirmed'}.</p>
          <p className="muted small">A new sign-up shows the confirmation token on the sign-in page, because there is no mail server. <Link to="/auth">Open confirmation</Link> if this account still needs it.</p>
        </Box>
      </div>
    </div>
  );
}
