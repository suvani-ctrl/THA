CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE batch_status AS ENUM (
  'pending',
  'running',
  'completed',
  'cancelled'
);

CREATE TYPE url_status AS ENUM (
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled'
);

CREATE TABLE IF NOT EXISTS batches (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  status     batch_status NOT NULL DEFAULT 'pending',
  total      INT         NOT NULL DEFAULT 0,
  completed  INT         NOT NULL DEFAULT 0,
  failed     INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT completed_non_negative CHECK (completed >= 0),
  CONSTRAINT failed_non_negative    CHECK (failed >= 0),
  CONSTRAINT total_non_negative     CHECK (total >= 0),


  CONSTRAINT completed_lte_total CHECK (completed <= total),
  CONSTRAINT failed_lte_total    CHECK (failed <= total)
);

CREATE TABLE IF NOT EXISTS url_results (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id    UUID        NOT NULL REFERENCES batches(id) ON DELETE CASCADE,


  url         VARCHAR(2048) NOT NULL,

  status      url_status  NOT NULL DEFAULT 'pending',
  http_code   INT,
  response_ms INT,
  page_title  TEXT,
  error       TEXT,
  attempt     INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

 
  CONSTRAINT valid_http_code CHECK (
    http_code IS NULL OR (http_code >= 100 AND http_code <= 599)
  ),

  CONSTRAINT valid_response_ms CHECK (
    response_ms IS NULL OR response_ms >= 0
  ),

  CONSTRAINT valid_attempt CHECK (attempt >= 0)
);


CREATE INDEX idx_url_results_batch_id
  ON url_results(batch_id);


CREATE INDEX idx_url_results_batch_id_status
  ON url_results(batch_id, status);


CREATE INDEX idx_url_results_pending
  ON url_results(batch_id)
  WHERE status = 'pending';


CREATE INDEX idx_batches_created_at
  ON batches(created_at DESC);


CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER url_results_updated_at
  BEFORE UPDATE ON url_results
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
