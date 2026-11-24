-- Number of answer options shown for each response (4 for format v4; NULL = legacy 4-6 options).
-- Calibration uses it for the guessing floor c = 1 / n_options.
ALTER TABLE responses ADD COLUMN n_options INTEGER;
