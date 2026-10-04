-- Apply only after backup + restore verification. Never executed at application startup.
-- Existing values/IDs/JSON are preserved. MySQL 8 DDL auto-commits.
ALTER TABLE survey_sections ADD COLUMN default_question_type VARCHAR(16) NULL;
ALTER TABLE survey_question_categories ADD COLUMN default_question_type VARCHAR(16) NULL;
ALTER TABLE survey_question_groups ADD COLUMN default_question_type VARCHAR(16) NULL;
ALTER TABLE question_bank
  MODIFY COLUMN question_type ENUM('rating','textarea','text','checkbox') NOT NULL DEFAULT 'rating',
  ADD COLUMN question_type_source VARCHAR(16) NULL,
  ADD COLUMN is_required TINYINT NULL,
  ADD COLUMN choices_json JSON NULL;
