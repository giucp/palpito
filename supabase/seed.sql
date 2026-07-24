-- Pálpito — datos de la cartelera del viernes 24 de julio de 2026
-- Fútbol y béisbol: partidos REALES de hoy (Torneo Clausura argentino, Liga
-- colombiana, chilena y paraguaya; MLB). Cuotas ilustrativas, no de mercado.
-- Otros deportes: eventos de referencia marcados como (ficticio).
-- Horas en zona de Venezuela (UTC-4).
--
-- Mercados al estilo de las casas grandes (Winamax/bet365):
--   Fútbol:  1X2 · Doble oportunidad · Ambos anotan · Total de goles (3 líneas)
--            y en partidos destacados: Hándicap asiático · Marcador exacto
--   Béisbol: Ganador · Línea de carreras (±1.5) · Total de carreras · Primeras 5 entradas

-- Empezar limpio (solo borra si ninguna apuesta referencia las selecciones)
delete from eventos;

-- Ayudante temporal para sembrar un evento completo desde JSON
create or replace function _sembrar(
  p_deporte text, p_liga text, p_a text, p_b text,
  p_comienza timestamptz, p_mercados jsonb
) returns void language plpgsql as $$
declare
  m jsonb; s jsonb; ev uuid; mid uuid; i int := 0; j int;
begin
  insert into eventos (deporte, liga, equipo_a, equipo_b, comienza_at)
  values (p_deporte, p_liga, p_a, p_b, p_comienza) returning id into ev;
  for m in select * from jsonb_array_elements(p_mercados) loop
    insert into mercados (evento_id, tipo, nombre, orden)
    values (ev, m->>'tipo', m->>'nombre', i) returning id into mid;
    j := 0;
    for s in select * from jsonb_array_elements(m->'sel') loop
      insert into selecciones (mercado_id, nombre, cuota, orden)
      values (mid, s->>0, (s->>1)::numeric, j);
      j := j + 1;
    end loop;
    i := i + 1;
  end loop;
end $$;

-- ============ FÚTBOL · Argentina · Torneo Clausura (hoy, reales) ============

select _sembrar('futbol', 'Argentina · Torneo Clausura', 'Gimnasia de Mendoza', 'Central Córdoba', '2026-07-24 15:45-04', '[
 {"tipo":"1x2","nombre":"Resultado final","sel":[["Local","2.40"],["Empate","3.10"],["Visitante","2.90"]]},
 {"tipo":"doble_oportunidad","nombre":"Doble oportunidad","sel":[["Local o Empate","1.36"],["Local o Visitante","1.32"],["Empate o Visitante","1.50"]]},
 {"tipo":"ambos_anotan","nombre":"Ambos equipos anotan","sel":[["Sí","1.95"],["No","1.78"]]},
 {"tipo":"total_goles","nombre":"Total de goles","sel":[["Más de 1.5","1.30"],["Menos de 1.5","3.30"],["Más de 2.5","2.10"],["Menos de 2.5","1.68"],["Más de 3.5","3.90"],["Menos de 3.5","1.24"]]}
]'::jsonb);

select _sembrar('futbol', 'Argentina · Torneo Clausura', 'Racing', 'Gimnasia La Plata', '2026-07-24 18:00-04', '[
 {"tipo":"1x2","nombre":"Resultado final","sel":[["Local","1.60"],["Empate","3.70"],["Visitante","5.60"]]},
 {"tipo":"doble_oportunidad","nombre":"Doble oportunidad","sel":[["Local o Empate","1.13"],["Local o Visitante","1.25"],["Empate o Visitante","2.20"]]},
 {"tipo":"ambos_anotan","nombre":"Ambos equipos anotan","sel":[["Sí","2.05"],["No","1.70"]]},
 {"tipo":"total_goles","nombre":"Total de goles","sel":[["Más de 1.5","1.26"],["Menos de 1.5","3.55"],["Más de 2.5","1.95"],["Menos de 2.5","1.80"],["Más de 3.5","3.45"],["Menos de 3.5","1.28"]]},
 {"tipo":"handicap","nombre":"Hándicap asiático","sel":[["Local -0.5","1.60"],["Visitante +0.5","2.28"],["Local -1.0","2.20"],["Visitante +1.0","1.62"]]},
 {"tipo":"marcador","nombre":"Marcador exacto","sel":[["1-0","5.50"],["2-0","6.25"],["2-1","8.00"],["0-0","8.50"],["1-1","7.50"],["0-1","13.00"]]}
]'::jsonb);

select _sembrar('futbol', 'Argentina · Torneo Clausura', 'Vélez', 'Instituto', '2026-07-24 18:00-04', '[
 {"tipo":"1x2","nombre":"Resultado final","sel":[["Local","1.85"],["Empate","3.30"],["Visitante","4.40"]]},
 {"tipo":"doble_oportunidad","nombre":"Doble oportunidad","sel":[["Local o Empate","1.20"],["Local o Visitante","1.31"],["Empate o Visitante","1.88"]]},
 {"tipo":"ambos_anotan","nombre":"Ambos equipos anotan","sel":[["Sí","2.00"],["No","1.74"]]},
 {"tipo":"total_goles","nombre":"Total de goles","sel":[["Más de 1.5","1.28"],["Menos de 1.5","3.45"],["Más de 2.5","2.00"],["Menos de 2.5","1.76"],["Más de 3.5","3.60"],["Menos de 3.5","1.26"]]}
]'::jsonb);

select _sembrar('futbol', 'Argentina · Torneo Clausura', 'Huracán', 'Banfield', '2026-07-24 20:15-04', '[
 {"tipo":"1x2","nombre":"Resultado final","sel":[["Local","2.30"],["Empate","3.00"],["Visitante","3.30"]]},
 {"tipo":"doble_oportunidad","nombre":"Doble oportunidad","sel":[["Local o Empate","1.31"],["Local o Visitante","1.36"],["Empate o Visitante","1.58"]]},
 {"tipo":"ambos_anotan","nombre":"Ambos equipos anotan","sel":[["Sí","1.90"],["No","1.83"]]},
 {"tipo":"total_goles","nombre":"Total de goles","sel":[["Más de 1.5","1.33"],["Menos de 1.5","3.15"],["Más de 2.5","2.15"],["Menos de 2.5","1.65"],["Más de 3.5","4.10"],["Menos de 3.5","1.21"]]}
]'::jsonb);

select _sembrar('futbol', 'Argentina · Torneo Clausura', 'Platense', 'Unión', '2026-07-24 20:15-04', '[
 {"tipo":"1x2","nombre":"Resultado final","sel":[["Local","2.50"],["Empate","2.95"],["Visitante","3.10"]]},
 {"tipo":"doble_oportunidad","nombre":"Doble oportunidad","sel":[["Local o Empate","1.36"],["Local o Visitante","1.39"],["Empate o Visitante","1.51"]]},
 {"tipo":"ambos_anotan","nombre":"Ambos equipos anotan","sel":[["Sí","1.92"],["No","1.80"]]},
 {"tipo":"total_goles","nombre":"Total de goles","sel":[["Más de 1.5","1.35"],["Menos de 1.5","3.05"],["Más de 2.5","2.20"],["Menos de 2.5","1.62"],["Más de 3.5","4.25"],["Menos de 3.5","1.20"]]}
]'::jsonb);

-- ============ FÚTBOL · Colombia · Primera A (hoy, reales) ============

select _sembrar('futbol', 'Colombia · Primera A', 'Llaneros', 'Pereira', '2026-07-24 18:00-04', '[
 {"tipo":"1x2","nombre":"Resultado final","sel":[["Local","2.25"],["Empate","3.00"],["Visitante","3.40"]]},
 {"tipo":"doble_oportunidad","nombre":"Doble oportunidad","sel":[["Local o Empate","1.29"],["Local o Visitante","1.36"],["Empate o Visitante","1.60"]]},
 {"tipo":"ambos_anotan","nombre":"Ambos equipos anotan","sel":[["Sí","1.98"],["No","1.75"]]},
 {"tipo":"total_goles","nombre":"Total de goles","sel":[["Más de 1.5","1.31"],["Menos de 1.5","3.25"],["Más de 2.5","2.12"],["Menos de 2.5","1.66"],["Más de 3.5","4.00"],["Menos de 3.5","1.22"]]}
]'::jsonb);

select _sembrar('futbol', 'Colombia · Primera A', 'Deportivo Cali', 'Jaguares de Córdoba', '2026-07-24 20:30-04', '[
 {"tipo":"1x2","nombre":"Resultado final","sel":[["Local","1.75"],["Empate","3.40"],["Visitante","4.90"]]},
 {"tipo":"doble_oportunidad","nombre":"Doble oportunidad","sel":[["Local o Empate","1.16"],["Local o Visitante","1.29"],["Empate o Visitante","2.00"]]},
 {"tipo":"ambos_anotan","nombre":"Ambos equipos anotan","sel":[["Sí","2.10"],["No","1.66"]]},
 {"tipo":"total_goles","nombre":"Total de goles","sel":[["Más de 1.5","1.27"],["Menos de 1.5","3.50"],["Más de 2.5","1.98"],["Menos de 2.5","1.78"],["Más de 3.5","3.55"],["Menos de 3.5","1.27"]]},
 {"tipo":"handicap","nombre":"Hándicap asiático","sel":[["Local -0.5","1.75"],["Visitante +0.5","2.05"],["Local -1.0","2.45"],["Visitante +1.0","1.53"]]},
 {"tipo":"marcador","nombre":"Marcador exacto","sel":[["1-0","5.25"],["2-0","6.00"],["2-1","7.75"],["0-0","7.90"],["1-1","7.25"],["0-1","11.50"]]}
]'::jsonb);

-- ============ FÚTBOL · Chile y Paraguay (hoy, reales) ============

select _sembrar('futbol', 'Chile · Primera División', 'Colo Colo', 'Deportes Limache', '2026-07-24 18:00-04', '[
 {"tipo":"1x2","nombre":"Resultado final","sel":[["Local","1.48"],["Empate","4.10"],["Visitante","6.50"]]},
 {"tipo":"doble_oportunidad","nombre":"Doble oportunidad","sel":[["Local o Empate","1.09"],["Local o Visitante","1.21"],["Empate o Visitante","2.50"]]},
 {"tipo":"ambos_anotan","nombre":"Ambos equipos anotan","sel":[["Sí","2.20"],["No","1.62"]]},
 {"tipo":"total_goles","nombre":"Total de goles","sel":[["Más de 1.5","1.24"],["Menos de 1.5","3.75"],["Más de 2.5","1.85"],["Menos de 2.5","1.90"],["Más de 3.5","3.25"],["Menos de 3.5","1.32"]]},
 {"tipo":"handicap","nombre":"Hándicap asiático","sel":[["Local -0.5","1.48"],["Visitante +0.5","2.55"],["Local -1.0","1.98"],["Visitante +1.0","1.78"]]},
 {"tipo":"marcador","nombre":"Marcador exacto","sel":[["1-0","4.90"],["2-0","5.40"],["2-1","7.50"],["0-0","9.50"],["1-1","8.25"],["0-1","15.00"]]}
]'::jsonb);

select _sembrar('futbol', 'Paraguay · División Profesional', 'Cerro Porteño', 'Trinidense', '2026-07-24 19:00-04', '[
 {"tipo":"1x2","nombre":"Resultado final","sel":[["Local","1.52"],["Empate","3.95"],["Visitante","6.20"]]},
 {"tipo":"doble_oportunidad","nombre":"Doble oportunidad","sel":[["Local o Empate","1.10"],["Local o Visitante","1.22"],["Empate o Visitante","2.42"]]},
 {"tipo":"ambos_anotan","nombre":"Ambos equipos anotan","sel":[["Sí","2.15"],["No","1.64"]]},
 {"tipo":"total_goles","nombre":"Total de goles","sel":[["Más de 1.5","1.25"],["Menos de 1.5","3.65"],["Más de 2.5","1.88"],["Menos de 2.5","1.87"],["Más de 3.5","3.35"],["Menos de 3.5","1.30"]]},
 {"tipo":"handicap","nombre":"Hándicap asiático","sel":[["Local -0.5","1.52"],["Visitante +0.5","2.45"],["Local -1.0","2.05"],["Visitante +1.0","1.72"]]},
 {"tipo":"marcador","nombre":"Marcador exacto","sel":[["1-0","5.00"],["2-0","5.60"],["2-1","7.60"],["0-0","9.00"],["1-1","8.00"],["0-1","14.00"]]}
]'::jsonb);

-- ============ BÉISBOL · MLB (hoy, reales; equipo local primero) ============

select _sembrar('beisbol', 'Estados Unidos · MLB', 'Pirates', 'Cubs', '2026-07-24 18:40-04', '[
 {"tipo":"ganador","nombre":"Ganador","sel":[["Local","2.20"],["Visitante","1.68"]]},
 {"tipo":"linea_carreras","nombre":"Línea de carreras","sel":[["Local +1.5","1.52"],["Visitante -1.5","2.50"]]},
 {"tipo":"total_carreras","nombre":"Total de carreras","sel":[["Más de 8.5","1.95"],["Menos de 8.5","1.87"]]},
 {"tipo":"primeras_5","nombre":"Primeras 5 entradas","sel":[["Local","2.30"],["Empate","3.90"],["Visitante","1.98"]]}
]'::jsonb);

select _sembrar('beisbol', 'Estados Unidos · MLB', 'Phillies', 'Yankees', '2026-07-24 18:45-04', '[
 {"tipo":"ganador","nombre":"Ganador","sel":[["Local","1.83"],["Visitante","1.99"]]},
 {"tipo":"linea_carreras","nombre":"Línea de carreras","sel":[["Local -1.5","2.60"],["Visitante +1.5","1.50"]]},
 {"tipo":"total_carreras","nombre":"Total de carreras","sel":[["Más de 9.0","1.92"],["Menos de 9.0","1.90"]]},
 {"tipo":"primeras_5","nombre":"Primeras 5 entradas","sel":[["Local","2.05"],["Empate","3.80"],["Visitante","2.20"]]}
]'::jsonb);

select _sembrar('beisbol', 'Estados Unidos · MLB', 'Mets', 'Dodgers', '2026-07-24 19:10-04', '[
 {"tipo":"ganador","nombre":"Ganador","sel":[["Local","2.10"],["Visitante","1.74"]]},
 {"tipo":"linea_carreras","nombre":"Línea de carreras","sel":[["Local +1.5","1.48"],["Visitante -1.5","2.65"]]},
 {"tipo":"total_carreras","nombre":"Total de carreras","sel":[["Más de 8.5","1.98"],["Menos de 8.5","1.84"]]},
 {"tipo":"primeras_5","nombre":"Primeras 5 entradas","sel":[["Local","2.25"],["Empate","3.85"],["Visitante","2.02"]]}
]'::jsonb);

select _sembrar('beisbol', 'Estados Unidos · MLB', 'Red Sox', 'Blue Jays', '2026-07-24 19:15-04', '[
 {"tipo":"ganador","nombre":"Ganador","sel":[["Local","1.95"],["Visitante","1.87"]]},
 {"tipo":"linea_carreras","nombre":"Línea de carreras","sel":[["Local -1.5","2.75"],["Visitante +1.5","1.45"]]},
 {"tipo":"total_carreras","nombre":"Total de carreras","sel":[["Más de 9.5","1.90"],["Menos de 9.5","1.92"]]},
 {"tipo":"primeras_5","nombre":"Primeras 5 entradas","sel":[["Local","2.15"],["Empate","3.75"],["Visitante","2.10"]]}
]'::jsonb);

select _sembrar('beisbol', 'Estados Unidos · MLB', 'Rangers', 'Mariners', '2026-07-24 20:05-04', '[
 {"tipo":"ganador","nombre":"Ganador","sel":[["Local","1.90"],["Visitante","1.92"]]},
 {"tipo":"linea_carreras","nombre":"Línea de carreras","sel":[["Local -1.5","2.70"],["Visitante +1.5","1.46"]]},
 {"tipo":"total_carreras","nombre":"Total de carreras","sel":[["Más de 8.0","1.95"],["Menos de 8.0","1.87"]]},
 {"tipo":"primeras_5","nombre":"Primeras 5 entradas","sel":[["Local","2.12"],["Empate","3.80"],["Visitante","2.14"]]}
]'::jsonb);

select _sembrar('beisbol', 'Estados Unidos · MLB', 'Giants', 'Angels', '2026-07-24 22:15-04', '[
 {"tipo":"ganador","nombre":"Ganador","sel":[["Local","1.65"],["Visitante","2.28"]]},
 {"tipo":"linea_carreras","nombre":"Línea de carreras","sel":[["Local -1.5","2.30"],["Visitante +1.5","1.60"]]},
 {"tipo":"total_carreras","nombre":"Total de carreras","sel":[["Más de 8.5","2.00"],["Menos de 8.5","1.82"]]},
 {"tipo":"primeras_5","nombre":"Primeras 5 entradas","sel":[["Local","1.92"],["Empate","3.85"],["Visitante","2.35"]]}
]'::jsonb);

-- ============ OTROS DEPORTES · referencia (ficticios) ============

select _sembrar('basket', 'NBA · Partido de referencia (ficticio)', 'Lakers', 'Celtics', '2026-07-25 19:00-04', '[
 {"tipo":"ganador","nombre":"Ganador","sel":[["Local","1.90"],["Visitante","1.92"]]},
 {"tipo":"total_puntos","nombre":"Total de puntos","sel":[["Más de 219.5","1.90"],["Menos de 219.5","1.90"]]}
]'::jsonb);

select _sembrar('tenis', 'ATP · Partido de referencia (ficticio)', 'C. Alcaraz', 'J. Sinner', '2026-07-25 14:00-04', '[
 {"tipo":"ganador","nombre":"Ganador","sel":[["Local","1.85"],["Visitante","1.95"]]},
 {"tipo":"total_juegos","nombre":"Total de juegos","sel":[["Más de 22.5","1.87"],["Menos de 22.5","1.93"]]}
]'::jsonb);

select _sembrar('mma', 'UFC · Cartelera de referencia (ficticio)', 'I. Makhachev', 'A. Volkanovski', '2026-07-25 23:00-04', '[
 {"tipo":"ganador","nombre":"Ganador","sel":[["Local","1.42"],["Visitante","2.90"]]}
]'::jsonb);

select _sembrar('esports', 'CS2 · Serie de referencia (ficticio)', 'FaZe', 'NAVI', '2026-07-25 16:00-04', '[
 {"tipo":"ganador","nombre":"Ganador","sel":[["Local","1.88"],["Visitante","1.92"]]},
 {"tipo":"total_mapas","nombre":"Total de mapas","sel":[["Más de 2.5","1.80"],["Menos de 2.5","2.00"]]}
]'::jsonb);

drop function _sembrar(text, text, text, text, timestamptz, jsonb);
