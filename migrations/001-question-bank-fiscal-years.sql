-- Run once on a verified backup/test database before using the new code.
-- Preflight: SHOW CREATE TABLE for all three existing tables; they must use InnoDB.
-- No historical rows are reassigned: NULL fiscal_year is the legacy template set.
-- DDL is not transactionally reversible in MySQL. Do not run against production automatically.
CREATE TABLE question_bank_years (
  fiscal_year INT NOT NULL PRIMARY KEY,
  source_fiscal_year INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE question_bank_write_lock (
  id INT NOT NULL PRIMARY KEY
) ENGINE=InnoDB;
INSERT INTO question_bank_write_lock (id) VALUES (1);

ALTER TABLE survey_question_categories
  ADD COLUMN fiscal_year INT NULL,
  ADD INDEX idx_categories_year (fiscal_year),
  ADD CONSTRAINT fk_categories_bank_year FOREIGN KEY (fiscal_year)
    REFERENCES question_bank_years (fiscal_year);
ALTER TABLE survey_question_groups
  ADD COLUMN fiscal_year INT NULL,
  ADD INDEX idx_groups_year (fiscal_year),
  ADD CONSTRAINT fk_groups_bank_year FOREIGN KEY (fiscal_year)
    REFERENCES question_bank_years (fiscal_year);
ALTER TABLE question_bank
  ADD COLUMN fiscal_year INT NULL,
  ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL,
  ADD INDEX idx_questions_year (fiscal_year),
  ADD CONSTRAINT fk_questions_bank_year FOREIGN KEY (fiscal_year)
    REFERENCES question_bank_years (fiscal_year);

-- Existing IDs, question references, Section keys, forms and submissions are untouched.
-- First year creation in Admin clones NULL-year rows into the explicitly requested year.
-- Validate orphan group/category references before creating that first year.
