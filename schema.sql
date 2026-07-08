-- Run this once in MySQL Workbench against your server.
-- It creates the database and a single table that stores the whole
-- portal state as one JSON document (id = 1, always upserted).
--
-- This mirrors exactly what the portal currently keeps in its built-in
-- shared storage, so switching is a drop-in swap. If you'd rather have
-- proper relational tables (students, teachers, payments, results, ...)
-- that's a natural next step once this is working — ask and we can
-- design that schema and a matching API.

CREATE DATABASE IF NOT EXISTS kabalega_portal
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE kabalega_portal;

CREATE TABLE IF NOT EXISTS portal_state (
  id INT PRIMARY KEY,
  data JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
