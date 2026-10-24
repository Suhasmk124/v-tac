# Project Proposal: Esports Tactical Analytics & Counter-Pick Engine (Valorant)

## 1. Project Title
**V-Tac: Valorant Esports Tactical Analytics & Counter-Pick Engine**

## 2. Problem Statement
In tier-one esports, standard statistics (Kills/Deaths/Assists) are insufficient for tactical preparation. Professional Valorant coaches lack centralized platforms that combine complex relational data (round-by-round economy tracking, agent compositions, and map control) with spatial and semantic data (positional kill heatmaps and strategic round clustering). Existing tools are either purely descriptive or require manual video review to find historical rounds with similar tactical setups.

## 3. Objectives and Scope
The objective is to build a web-based intelligence platform for professional esports teams to:
*   Track and aggregate granular match telemetry, player statistics, and round-by-round economy shifts.
*   Implement Role-Based Access Control (RBAC) to differentiate between administrative coaches and analytical scouts.
*   Utilize advanced relational database features (Procedures, Views, Triggers) to automate insights.
*   Leverage a Vector Database extension to perform similarity searches, allowing users to find historical tactical rounds that closely match a specified scenario (e.g., finding similar economy/agent-positioning states).

## 4. Technical Stack
*   **Frontend & Backend:** Next.js (App Router, Server Actions, API Route Handlers)
*   **Primary Database (SQL):** PostgreSQL
*   **Vector Database:** `pgvector` (PostgreSQL Extension)
*   **Data Pipeline:** Python (Pandas) for extracting/transforming VLR.gg dataset CSVs/SQLite into the DB.
*   **Version Control:** Git + GitHub

## 5. Database Choice & Justification
To satisfy the Level 3 Multi-DB Paradigm requirement (SQL + Vector DB), we justify our architecture as follows:

*   **Relational SQL (PostgreSQL):** Mandatory for the core architecture due to the highly structured, interconnected nature of esports tournaments. Strict ACID compliance and Foreign Key constraints are necessary to map the complex hierarchy of `Tournaments -> Matches -> Games -> Rounds -> Kill Events`. SQL aggregation and window functions are essential for calculating time-series player metrics (like Average Combat Score).
*   **Vector Database (`pgvector`):** Relational databases cannot natively perform "similarity" queries on unstructured strategic patterns. We use `pgvector` to store 128-dimensional vector embeddings of a round's tactical profile (combining X/Y kill coordinates, economy spend, and agent roles). This allows coaches to run a Cosine Similarity Search to ask: *"Find me past rounds across any tournament that played out exactly like this specific half-buy retake on Ascent B-Site."*

## 6. Relational Schema (12 Tables)
1.  **Teams:** (PK: `TeamID`, `TeamName`, `Region`, `WorldRank`)
2.  **Players:** (PK: `PlayerID`, FK: `TeamID`, `Handle`, `Role`)
3.  **Tournaments:** (PK: `TournamentID`, `Name`, `StartDate`, `PrizePool`)
4.  **Matches:** (PK: `MatchID`, FK: `TournamentID`, FK: `Team1ID`, FK: `Team2ID`, `Date`, `Format`)
5.  **Maps:** (PK: `MapID`, `MapName`, `ReleasePatch`)
6.  **Match_Games:** (PK: `GameID`, FK: `MatchID`, FK: `MapID`, `Team1Score`, `Team2Score`)
7.  **Game_Rounds:** (PK: `RoundID`, FK: `GameID`, `RoundNumber`, `WinningTeamID`, `WinCondition`)
8.  **Player_Round_Stats:** (PK: `StatID`, FK: `RoundID`, FK: `PlayerID`, `Kills`, `Deaths`, `Damage`, `EconomyCredits`)
9.  **Agent_Picks:** (PK: `PickID`, FK: `GameID`, FK: `PlayerID`, `AgentName`)
10. **Weapon_Buys:** (PK: `BuyID`, FK: `RoundID`, FK: `PlayerID`, `WeaponName`, `ArmorTier`)
11. **Kill_Events:** (PK: `EventID`, FK: `RoundID`, FK: `KillerID`, FK: `VictimID`, `WeaponUsed`, `IsHeadshot`)
12. **Tactical_Embeddings (Vector):** (PK: `VectorID`, FK: `RoundID`, `RoundProfileEmbedding` (vector type))

## 7. Advanced Database Features (4+ Required)
1.  **Vector Similarity Search:** Utilizing `pgvector` operators (`<=>` for cosine distance) to cluster and retrieve strategically similar rounds.
2.  **Stored Procedures:** `sp_PredictWinProbability` - Calculates the probability of a team winning a specific round based on aggregate historical data of their current weapon loadout values vs. opponent loadout values.
3.  **Database Triggers:** Automatically inserts an audit flag into an alerts table if a `Player_Round_Stats` entry exceeds 3 standard deviations from the player's season average (detecting anomalous underperformance or overperformance).
4.  **Materialized Views:** `mv_PlayerLeaderboards` - A pre-computed view that joins 5 tables to update live tournament leaderboards (Highest ACS, Best Headshot %), optimizing heavy read queries on the dashboard.
5.  **Indexing:** B-Tree indexing on `(MatchID, GameID, RoundNumber)` for fast hierarchical data retrieval, and IVFFlat indexing on the vector embeddings for fast similarity searches.

## 8. Role-Based Access Control (RBAC) & Security
*   **Role 1: Head_Coach (Admin):** Full write access. Can insert new scrimmage data, update team rosters, and execute the advanced stored procedures for predictive modeling.
*   **Role 2: Scout_Analyst (Read-Only):** Can view dashboards, run complex `SELECT` aggregations, and query the vector database for historical VOD reviews.
*   **Security:** Passwords hashed using bcrypt. Database connection strings stored securely in Next.js `.env.local`. Validation enforced both at the UI and DB constraint levels.
