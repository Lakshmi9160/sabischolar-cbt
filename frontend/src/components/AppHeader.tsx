import React from "react";
import { Link, NavLink } from "react-router-dom";

const navClass = ({ isActive }: { isActive: boolean }) => `ss-nav-link${isActive ? " ss-active" : ""}`;

export type AppHeaderProps = {
  token: string;
  profileReady: boolean;
  isAdmin: boolean;
  onLoadLeaderboard: () => void;
  onLogout: () => void;
};

export const AppHeader: React.FC<AppHeaderProps> = ({
  token,
  profileReady,
  isAdmin,
  onLoadLeaderboard,
  onLogout
}) => (
  <header className="ss-header">
    <div className="ss-header-inner">
      <Link to="/dashboard" className="ss-brand">
        <span className="ss-brand-name">SabiScholar</span>
        <span className="ss-brand-badge">CBT</span>
      </Link>
      <nav className="ss-nav" aria-label="Main">
        <NavLink className={navClass} to="/auth">
          Auth
        </NavLink>
        <NavLink className={navClass} to="/dashboard">
          Dashboard
        </NavLink>
        <NavLink className={navClass} to="/exam">
          Exam
        </NavLink>
        <NavLink className={navClass} to="/results">
          Results
        </NavLink>
        <button type="button" onClick={onLoadLeaderboard}>
          Leaderboard
        </button>
        {profileReady && isAdmin ? (
          <NavLink className={navClass} to="/admin">
            Admin
          </NavLink>
        ) : null}
        {token ? (
          <button type="button" onClick={onLogout} aria-label="Log out">
            Logout
          </button>
        ) : null}
      </nav>
    </div>
  </header>
);
