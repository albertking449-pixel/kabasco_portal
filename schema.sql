-- Run this once in MySQL Workbench (select all, then the ⚡ "Execute" button)
-- Creates the database + a single-row JSON store for the whole portal state.
-- This mirrors exactly what the portal already saves/loads as one JSON blob.

CREATE DATABASE IF NOT EXISTS kabalega_portal
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE kabalega_portal;

CREATE TABLE IF NOT EXISTS portal_state (
  id INT PRIMARY KEY,               -- always 1, single-row store
  data JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
             ON UPDATE CURRENT_TIMESTAMP
);

-- Seed an empty row so the very first GET doesn't 404.
-- The portal will overwrite this with its real starter data on first save.
INSERT IGNORE INTO portal_state (id, data) VALUES (1, JSON_OBJECT());
