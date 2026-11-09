-- Ponto: marcações de almoço (entrada, saída para almoço, retorno, saída) opcionais por
-- empresa, e recusa da marcação que abriria a jornada num dia de folga da escala.
ALTER TABLE "clock_settings" ADD COLUMN     "block_off_day" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "break_punches" BOOLEAN NOT NULL DEFAULT false;
