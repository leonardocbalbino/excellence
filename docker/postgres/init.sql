-- Executado apenas na primeira inicialização do volume.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- Banco separado para testes locais que não usam Testcontainers.
CREATE DATABASE excellence_test;
\connect excellence_test
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
