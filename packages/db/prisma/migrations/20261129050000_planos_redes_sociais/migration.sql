-- Planos de Redes Sociais (decisão #185): campos novos e os planos já criados (ocultos até o dono definir os preços)
ALTER TABLE "Empresa" ADD COLUMN "redesSociais" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Empresa" ADD COLUMN "permiteDisparos" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Plano" ADD COLUMN "redesSociais" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Plano" ADD COLUMN "permiteDisparos" BOOLEAN NOT NULL DEFAULT true;

-- Categoria REDES SOCIAIS: um plano mensal para cada plano mensal pago de hoje (Individual e Business), sem disparos e sem preço (o dono define)
INSERT INTO "Plano" ("atualizadoEm",id,slug,nome,modulo,usuarios,gratis,personalizado,"precoAntigo","precoAtual",periodo,"prazoDias","testeDias","testeDisparos",selo,frase,condicoes,"ofertaTexto",recursos,"textoBotao",visivel,destaque,ordem,"limiteLeads","limiteIAUsd","limiteMateriais","limitePaginasMes","leadsAnuncios","maxWhatsapps","precoWhatsappExtra","disparosPorPeriodo","pacoteDisparos","precoPacoteDisparos",descontos,"maxPacotes",categoria,"redesSociais","permiteDisparos")
SELECT now(), 'c'||substr(md5(random()::text||clock_timestamp()::text||p.slug),1,24), 'redes-'||p.slug, 'Redes Sociais '||p.nome, p.modulo, p.usuarios, false, false, NULL, NULL, p.periodo, p."prazoDias", NULL, NULL,
  '', 'Receba e qualifique os leads das redes sociais com a IA.', p.condicoes, '',
  CASE WHEN p.modulo = 'EMPRESARIAL'
    THEN ARRAY['Recebe os leads das redes sociais (Facebook, Instagram e Google Ads)','A IA atende e qualifica cada lead na hora','Distribuição automática dos leads para a equipe (roleta entre quem está logado)','O Admin da Empresa escolhe quem participa da roleta','Plano mensal, sem disparos de campanha']
    ELSE ARRAY['Recebe os leads das redes sociais (Facebook, Instagram e Google Ads)','A IA atende e qualifica cada lead na hora','Plano mensal, sem disparos de campanha'] END,
  p."textoBotao", false, false, (SELECT COALESCE(MAX(ordem),0) FROM "Plano") + row_number() OVER (ORDER BY p.ordem), p."limiteLeads", p."limiteIAUsd", p."limiteMateriais", p."limitePaginasMes", true, p."maxWhatsapps", p."precoWhatsappExtra", NULL, NULL, NULL, p.descontos, p."maxPacotes", 'REDES', true, false
FROM "Plano" p
WHERE NOT p.gratis AND NOT p.personalizado AND p."disparosPorPeriodo" IS NULL AND p.categoria IN ('INDIVIDUAL','BUSINESS')
  AND NOT EXISTS (SELECT 1 FROM "Plano" x WHERE x.slug = 'redes-'||p.slug);

-- Categoria REDES SOCIAIS + DISPAROS: cópia de cada plano mensal pago, com o mesmo preço, mais as informações das redes sociais
INSERT INTO "Plano" ("atualizadoEm",id,slug,nome,modulo,usuarios,gratis,personalizado,"precoAntigo","precoAtual",periodo,"prazoDias","testeDias","testeDisparos",selo,frase,condicoes,"ofertaTexto",recursos,"textoBotao",visivel,destaque,ordem,"limiteLeads","limiteIAUsd","limiteMateriais","limitePaginasMes","leadsAnuncios","maxWhatsapps","precoWhatsappExtra","disparosPorPeriodo","pacoteDisparos","precoPacoteDisparos",descontos,"maxPacotes",categoria,"redesSociais","permiteDisparos")
SELECT now(), 'c'||substr(md5(random()::text||clock_timestamp()::text||p.slug||'d'),1,24), 'redes-disparos-'||p.slug, 'Redes Sociais + Disparos '||p.nome, p.modulo, p.usuarios, false, false, p."precoAntigo", p."precoAtual", p.periodo, p."prazoDias", NULL, NULL,
  p.selo, 'Leads das redes sociais qualificados pela IA e disparos de campanha sem limite.', p.condicoes, p."ofertaTexto",
  p.recursos || CASE WHEN p.modulo = 'EMPRESARIAL'
    THEN ARRAY['Recebe os leads das redes sociais e a IA os qualifica','Distribuição automática dos leads para a equipe (roleta entre quem está logado)','O Admin da Empresa escolhe quem participa da roleta']
    ELSE ARRAY['Recebe os leads das redes sociais e a IA os qualifica'] END,
  p."textoBotao", false, false, (SELECT COALESCE(MAX(ordem),0) FROM "Plano") + row_number() OVER (ORDER BY p.ordem), p."limiteLeads", p."limiteIAUsd", p."limiteMateriais", p."limitePaginasMes", true, p."maxWhatsapps", p."precoWhatsappExtra", NULL, NULL, NULL, p.descontos, p."maxPacotes", 'REDES_DISPAROS', true, true
FROM "Plano" p
WHERE NOT p.gratis AND NOT p.personalizado AND p."disparosPorPeriodo" IS NULL AND p.categoria IN ('INDIVIDUAL','BUSINESS')
  AND NOT EXISTS (SELECT 1 FROM "Plano" x WHERE x.slug = 'redes-disparos-'||p.slug);
