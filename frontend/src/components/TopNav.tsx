import React from "react";
import { AppPage } from "../types";

type Props = {
  setPage: (page: AppPage) => void;
  onLoadLeaderboard: () => void;
};

export const TopNav: React.FC<Props> = ({ setPage, onLoadLeaderboard }) => {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
      <button onClick={() => setPage("auth")}>Auth</button>
      <button onClick={() => setPage("dashboard")}>Dashboard</button>
      <button onClick={() => setPage("exam")}>Exam</button>
      <button onClick={() => setPage("results")}>Results</button>
      <button onClick={onLoadLeaderboard}>Leaderboard</button>
      <button onClick={() => setPage("admin")}>Admin</button>
    </div>
  );
};

