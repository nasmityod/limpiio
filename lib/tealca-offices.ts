/**
 * Lista blanca oficial de oficinas TEALCA por estado (paralela a lib/zoom-offices.ts).
 * Fuente: scraping del directorio público de Tealca (tealca.com/oficinas/).
 * Generado por scripts/scrape-tealca.ts.
 *
 * Auditoría 2026-07-08 (ver docs/tealca-audit.md):
 * - Se agregaron 9 oficinas confirmadas contra tealca.com (6 en Distrito Capital,
 *   3 en Miranda), descubiertas siguiendo los enlaces "Otras Oficinas Cercanas"
 *   de cada página de detalle (el sitio no expone sitemap indexado ni endpoint
 *   AJAX accesible desde este entorno).
 * - Se reclasificaron 3 oficinas de Distrito Capital → Miranda porque su propio
 *   campo "Dirección" en tealca.com declara literalmente "Estado Miranda"
 *   (Boleíta, El Rosal – Chacao, Filas De Mariches), aunque cuelgan del slug
 *   padre /oficinas/d-capital/.
 * - NO se completó una reconstrucción exhaustiva de los 23 estados (ver
 *   limitaciones en docs/tealca-audit.md). Aragua, Zulia y Anzoátegui ya habían
 *   sido verificados manualmente por el usuario antes de esta auditoría.
 */

export interface TealcaOffice {
  /** Nombre de la oficina Tealca. */
  name: string;
  /** Código interno de la oficina Tealca. */
  code: string;
  /** Ciudad donde se ubica la oficina. */
  city: string;
  /** Dirección completa. Vacío si no está en el directorio. */
  address: string;
}

export const tealcaOffices: Record<string, TealcaOffice[]> = {
  "Anzoátegui": [
    {
      name: "Anaco",
      code: "2912",
      city: "Anaco",
      address: "Av. Jose Antonio Anzotegui, CC. Anaco Center, nivel 1, local 60, zona Aeropuerto, municipio Anaco , Region Oriente, Anzoategui, Anaco, Municipio Anaco, Código Postal 6003",
    },
    {
      name: "Barcelona",
      code: "2907",
      city: "Barcelona",
      address: "Sector Nueva Barcelona, Local C, N° 18, C.C Los Chaguaramos, Av. Fuerza Armadas, Parroquia El Carmen, Municipio Simón Bolívar, Barcelona, Estado Anzoátegui.",
    },
    {
      name: "El Tigre",
      code: "2901",
      city: "El Tigre",
      address: "Centro El Tigre, Edif. 3ra. Carrera Sur con 3ra. Calle, Pueblo Nuevo Sur, Parroquia Edmundo Barrios, Municipio Simón Rodríguez, El Tigre, Estado Anzoátegui.",
    },
    {
      name: "Lechería",
      code: "2906",
      city: "Lecheria",
      address: "Av. Intercomunal Jorge Rodriguez, Centro Comercial DADDAVEN, Sector Las Garzas, nivel PB local 09, Region Oriente, Anzoátegui, Lecheria, Código Postal 6016",
    },
    {
      name: "Puerto La Cruz",
      code: "2909",
      city: "Puerto La Cruz",
      address: "Av. Stadium, C.C. Cardón, Nivel PB, Local 16 y 17, Sector Casco Central, Puerto La Cruz, Estado Anzoátegui.",
    },
    {
      name: "Puerto Piritu",
      code: "J2911",
      city: "Puerto Piritu",
      address: "",
    },
  ],
  "Apure": [
    {
      name: "San Fernando De Apure",
      code: "J5307",
      city: "San Fernando De Apure",
      address: "",
    },
  ],
  "Aragua": [
    {
      name: "Cagua",
      code: "5115",
      city: "Cagua",
      address: "Calle Sucre, C.C. La Pirámide, Local A -30, Cagua, Parroquia Centro Cagua, Municipio Sucre, Estado Aragua.",
    },
    {
      name: "La Morita",
      code: "5117",
      city: "Turmero",
      address: "Av. Doctor Montoya, C.C. Estación de Servicios Casa Gómez, PB, Local 7-3, Sector la Morita 1, Parroquia Turmero, Municipio Santiago Mariño, Turmero, Estado Aragua.",
    },
    {
      name: "La Victoria",
      code: "5118",
      city: "La Victoria",
      address: "Urb. Nueva Victoria, C.C. Cilento, Local PB-09, Parroquia Castor Nieves, Municipio José Félix Ribas, La Victoria, Estado Aragua.",
    },
    {
      name: "Las Delicias",
      code: "5122",
      city: "Maracay",
      address: "AV LAS DELICIAS CENTRO COMERCIAL REGIONAL NIVEL PB LOCAL M20 URB EL BOSQUE , Region Centro, Aragua, Maracay, Código Postal 2102",
    },
    {
      name: "Maracay Este (av. Sucre)",
      code: "5113",
      city: "Maracay",
      address: "Av. Sucre Norte, Centro Empresarial Sucre, PB, local N°4, Maracay, Estado Aragua.",
    },
    {
      name: "Maracay Oeste",
      code: "5119",
      city: "Maracay",
      address: "CALLE RICAURTE CASA NRO 30 SECTOR CENTRO SUR OESTE, Region Centro, Aragua, Maracay, Código Postal 2101",
    },
    {
      name: "Oficina Comercial Maracay",
      code: "CC",
      city: "Maracay",
      address: "Av. Bermúdez con Av. Aragua, Local C, C.C. Maracay Plaza, PB, Local 80 F, Parroquia José Casanova Godoy, Municipio Girardot, Maracay, Estado Aragua.",
    },
    {
      name: "Tealca Maracay Sector Santa Ana",
      code: "5113B",
      city: "Maracay",
      address: "Sector Urbanizacin Santa Ana, Av. Los Cedros C El Canal N 177B, Region Centro, Aragua, Maracay, Código Postal 2103",
    },
    {
      name: "Turmero",
      code: "5120",
      city: "Turmero",
      address: "CALLE MIRANDA CON CALLE CEDENO N50 CC VENEZUELA NIVEL PB LOCAL 3 , Region Centro, Aragua, Turmero, Municipiosantiago Marino, Código Postal 2115",
    },
  ],
  "Barinas": [
    {
      name: "Alto Barinas",
      code: "8006",
      city: "Barinas",
      address: "Av. El Progreso Cruce con calle 03 C.C Plaza Premium Nivel P.B Local 04 Sector Alto Barinas Norte, Region Los Andes, Barinas, Barinas, Municipio Barinas, Código Postal 5201",
    },
    {
      name: "Barinas",
      code: "J8006",
      city: "Socopo",
      address: "",
    },
    {
      name: "Barinas Centro Comercial Barinas",
      code: "8006B",
      city: "Barinas",
      address: "Av. 23 de enero con Av. Agustin Codazzi, CC Barinas Antiguo CADA Torre A, Nivel PB, Local N 5A, Region Los Andes, Barinas, Barinas, Municipio Barinas, Código Postal 5201",
    },
    {
      name: "Barinitas",
      code: "8007",
      city: "Barinitas",
      address: "AV INTERCOMUNAL RAFAEL ROCHE, LOCAL HOTEL CACAO SUITES NRO 01, SECTOR VILLA NUEVA BARINITAS, Region Los Andes, Barinas, Barinitas, Municipio Barinitas, Código Postal 5206",
    },
    {
      name: "Santa Barbara De Barinas",
      code: "8008",
      city: "Santa Barbara De Barinas",
      address: "Calle 10 entre carrera 4 y 5 Casa Nro SN Sector Pueblo Viejo, Region Los Andes, Barinas, Santa Barbara De Barinas, Código Postal 5210",
    },
  ],
  "Bolívar": [
    {
      name: "Ciudad Bolivar",
      code: "3210",
      city: "Ciudad Bolivar",
      address: "AV. JESUS SOTO Y AV. PROSPERO REVERENT EDIF. ARIANNE PISO PB LOCAL 5 SECTOR AEROPUERTO, Region Oriente, Bolívar, Ciudad Bolivar, Código Postal 8001",
    },
    {
      name: "Puerto Ordaz Alta Vista",
      code: "3205B",
      city: "Puerto Ordaz",
      address: "UD 255 CARRERA NEKUIMA EDIF MULTICENTRO PB LOCAL NRO 3 DETRAS DE LA FERRETERIA PRINCIPAL ALTA VISTA , Region Oriente, Bolívar, Puerto Ordaz, Código Postal 8050",
    },
    {
      name: "Puerto Ordaz Castillito",
      code: "3205",
      city: "Puerto Ordaz",
      address: "CALLE EL PALMAR, EDIF ROLA PISO PB LOCAL D 4 5 6 SECTOR CASTILLITO PUERTO ORDAZ CIUDAD GUAYANA , Region Oriente, Bolívar, Puerto Ordaz, Código Postal 8050",
    },
    {
      name: "San Félix (el Roble)",
      code: "3208",
      city: "San Felix",
      address: "Av. Moreno de Mendoza, C.C. La Cariñosa, PB, Local 01 , Sector El Roble, San Félix, Estado Bolívar.",
    },
    {
      name: "Unare",
      code: "3207",
      city: "Unare",
      address: "Urb. Unare II, Av. 1, Sector II, Edif. Ipeca, PB, Local N° 2, Parroquia Unare, Municipio Caroní, Puerto Ordaz, Estado Bolívar.",
    },
    {
      name: "Upata",
      code: "3208B",
      city: "Upata",
      address: "Centro Comercial Residencial Colonial Park, Calle Upata B, cruce con Calle Pao, Region Oriente, Bolivar, Upata, Municipio Piar, Código Postal 8052",
    },
    {
      name: "Ventuari",
      code: "3209",
      city: "Puerto Ordaz",
      address: "Av. Atlántico cruce con Av. Norte Sur 4, Region Oriente, Bolivar, Puerto Ordaz, Código Postal 0",
    },
  ],
  "Carabobo": [
    {
      name: "Caucagua – Higuerote – Barlovento – Tacarigua",
      code: "J1306",
      city: "Miranda",
      address: "",
    },
    {
      name: "Guacara",
      code: "5214",
      city: "Guacara",
      address: "Calle Arévalo González, entre calles Páez y Carabobo, C.C. Da Vinci, Nivel PB, Local Nº 5, Guacara, Estado Carabobo.",
    },
    {
      name: "Naguanagua",
      code: "5209",
      city: "Valencia",
      address: "Av. 96B, sector Las Quintas, Local 175-55, Municipio Naguanagua, Parroquia Naguanagua, Estado Carabobo.",
    },
    {
      name: "Oficina Comercial Valencia",
      code: "DD",
      city: "Valencia",
      address: "Zona Industrial Castillito, C.C. La Unión, vía Los Guayabitos, Galpón N° 3, Parroquia San Diego, Municipio San Diego, Valencia, Estado Carabobo.",
    },
    {
      name: "Puerto Cabello Moron",
      code: "J5215",
      city: "Puerto Cabello",
      address: "",
    },
    {
      name: "San Diego",
      code: "5210",
      city: "Valencia",
      address: "Av. Intercomunal Don Julio Centeno, C.C. Metromarket, 2da. Etapa, Local R9, Urbanización Complejo Los Jarales, Parroquia Urbana San Diego, Municipio San Diego, Estado Carabobo.",
    },
    {
      name: "Tocuyito",
      code: "5211",
      city: "Valencia",
      address: "Vía de Servicio Valencia-Campo de Carabobo, Urb. Pocaterra, Local N° 2, Parroquia Tocuyito, Municipio Libertador, Valencia, Estado Carabobo.",
    },
    {
      name: "Valencia (av. Andrés Eloy Blanco)",
      code: "5201",
      city: "Valencia",
      address: "Av. Andrés Eloy Blanco, con Av. Carlos Sanda, C.C. Beverly Center, PB, Local L 1-24, Urb. El Viñedo, Estado Carabobo.",
    },
    {
      name: "Valencia (distribuidor San Blas)",
      code: "5207",
      city: "Valencia",
      address: "Calle Negro Primero, N° 97-31, Distribuidor San Blas, Parroquia San Blas, Municipio Valencia, Valencia, Estado Carabobo.",
    },
    {
      name: "Valencia (plaza La Candelaria)",
      code: "5207B",
      city: "Valencia",
      address: "Calle Cantaura con calle Carabobo, C.C. Plaza Candelaria, Local No. 5, Parroquia La Candelaria, Municipio Valencia, Valencia, Estado Carabobo.",
    },
  ],
  "Cojedes": [
    {
      name: "San Carlos",
      code: "5402",
      city: "San Carlos",
      address: "Av. Bolivar Centro Comercial Costa Verde, Nivel PB, Local 4, Sector Centro Cojedes, Región Occidente, Cojedes, San Carlos, Municipio San Carlos De Austria, Código Postal 2201",
    },
    {
      name: "Tinaquillo",
      code: "5403",
      city: "Tinaquillo",
      address: "CALLE PRINCIPAL CRUCE CON CALLE SOCORRO, LOCAL NRO 12 68, SECTOR ANZOATEGUI, Región Occidente, Cojedes, Tinaquillo, Municipio Falcon, Urbana San Joaquin, Código Postal 2209",
    },
  ],
  "Delta Amacuro": [
    {
      name: "Tucupita",
      code: "3300",
      city: "Tucupita",
      address: "Avenida Arismendi Local N 75 Sector Centro, Region Oriente, Delta Amacuro, Tucupita, Código Postal 6401",
    },
  ],
  "Distrito Capital": [
    {
      name: "Av. Victoria",
      code: "",
      city: "",
      address: "",
    },
    {
      name: "Catia",
      code: "1125",
      city: "Caracas",
      address: "Calle Maury, Casa La Valenciana Nº PB, Urbanización Catia Caracas–Distrito Capital Zona Postal 1030",
    },
    {
      name: "Ccct",
      code: "1137B",
      city: "Caracas",
      address: "Centro Comercial Cuidad Tamanaco, Mini Tienda N.5, Local 47 A 01 Nivel C1 Primera Etapa , Gran Caracas, D.Capital, Caracas, Municipiochacao, Código Postal 1061",
    },
    {
      name: "El Cafetal",
      code: "1142",
      city: "Caracas",
      address: "VEN - República Bolivariana de Venezuela, Gran Caracas, D.Capital, Caracas, Municipio Baruta, Av. Boulevar Raúl Leoni, Centro Comercial Plaza Las Américas, Nivel Oro Local 1-08B, Codigo Postal 1080",
    },
    {
      name: "El Cementerio",
      code: "1128B",
      city: "Caracas",
      address: "Av. Principal de El Cementerio, cruce con calle El Degredo, Mercado Merposur, Municipio Libertador, Caracas, Distrito Capital.",
    },
    {
      name: "El Paraíso",
      code: "1126",
      city: "Caracas",
      address: "Urb. El Paraíso, Av. Washington, Qta. Nina, Local PB, Parroquia El Paraíso, Municipio Libertador, Caracas, Distrito Capital.",
    },
    {
      name: "Junquito",
      code: "1141",
      city: "El Junquito",
      address: "Gran Caracas, D.Capital, El Junquito",
    },
    {
      name: "Sabana Grande",
      code: "1102",
      city: "Caracas",
      address: "Av. Los Jabillos, entre Av. Francisco Solano López y Calle Las Flores, Galpón N° 6, Sabana Grande, Parroquia El Recreo, Municipio Libertador, Caracas, Distrito Capital.",
    },
    {
      name: "La Candelaria",
      code: "1128",
      city: "Caracas",
      address: "Av. Fuerzas Armadas, Esq. Socorro, Edif. Residencias Dorado, PB, Local 2, Parroquia Altagracia, Municipio Libertador, Caracas, Distrito Capital.",
    },
    {
      name: "Los Palos Grandes",
      code: "1127",
      city: "Caracas",
      address: "Urb. Los Palos Grandes, 4ta avenida entre 2da y 3era transversal, edificio los eucaliptos PB local B, Gran Caracas, D.Capital, Caracas, Código Postal 0",
    },
    {
      name: "Los Caobos",
      code: "1131",
      city: "Caracas",
      address: "Transversal Colón entre Av. Principal de Maripérez y Montevideo, Edif. Tirrenia Pub, Local C, Parroquia El Recreo, Urbanización Los Caobos, Municipio Libertador, Caracas, Distrito Capital.",
    },
    {
      name: "Los Chaguaramos",
      code: "AA",
      city: "Caracas",
      address: "Urb. Los Chaguaramos, Edif. Llaeco, Torre A, PB, Local A-3, Ciudad Universitaria con Calle Codazzi, Parroquia San Pedro, Municipio Libertador, Caracas, Distrito Capital.",
    },
    {
      name: "San Martín",
      code: "1119",
      city: "Caracas",
      address: "Av Jose Angel Lamas, Calle Sevilla, Edificio Indaragua, Piso PB Local B2 Urb San Martin , Gran Caracas, D.Capital, Caracas, Municipio Libertador, Código Postal 1020",
    },
  ],
  "Falcón": [
    {
      name: "Coro",
      code: "7607",
      city: "Coro",
      address: "Calle Domingo esquina Calle Democracia, Local Colina Nro. PB Sector Los Claritos Santa Ana de Coro, Región Occidente, Falcon, Coro, Código Postal 4101",
    },
    {
      name: "Punta Cardon",
      code: "7608",
      city: "Punta Cardon",
      address: "AV. 06 CENTRO COMERCIAL LAS VIRTUDES, NIVEL PB LOCAL AEM20, SECTOR MARAVEN, Región Occidente, Falcón, Punta Cardon, Código Postal 4101",
    },
    {
      name: "Punto Fijo",
      code: "7607B",
      city: "Punto Fijo",
      address: "Calle Zamora Esquina Calle Paraguay, Edificio Raquel PB Sector Centro , Región Occidente, Falcon, Punto Fijo, Código Postal 4102",
    },
  ],
  "Guárico": [
    {
      name: "Calabozo",
      code: "5501",
      city: "Calabozo",
      address: "Calle 11, entre Carreras 10 y 11, Casa Nro 2, Sector Casco Central Calabozo Edo Guarico, Region Centro, Guarico, Calabozo, Municipio Francisco De Miranda, Código Postal 2312",
    },
    {
      name: "San Juan De Los Morros – Villa De Cura",
      code: "J5121",
      city: "San Juan De Los Morr",
      address: "",
    },
    {
      name: "Valle De La Pascua",
      code: "5303",
      city: "Valle De La Pascua",
      address: "Calle Atarraya, Edif. Guirdanella, Plata Baja, Local N° 1, Sector Centro, Parroquia Valle de La Pascua, Municipio Leonardo Infante, Estado Guárico.",
    },
  ],
  "La Guaira": [
    {
      name: "Caraballeda",
      code: "",
      city: "",
      address: "",
    },
    {
      name: "Catia La Mar",
      code: "J1231",
      city: "Catia La Mar",
      address: "",
    },
    {
      name: "Maiquetia",
      code: "1234",
      city: "Maiquetia",
      address: "CALLE LOS BANOS CENTRO EMPRESARIAL LEANDER LOCAL NRO 16 PB SECTOR MAIQUETIA , Gran Caracas, Vargas, Maiquetia, Código Postal 1161",
    },
  ],
  "Lara": [
    {
      name: "Barquisimeto Carrera 19",
      code: "7918C",
      city: "Barquisimeto",
      address: "Carrera 19, entre calle 39 y 40, Región Occidente, Lara, Barquisimeto, Código Postal 3011",
    },
    {
      name: "Barquisimeto Este",
      code: "7910",
      city: "Barquisimeto",
      address: "Carrera 24, entre calle 6 y Av. Morán, Parroquia Catedral, Municipio Iribarren, Barquisimeto, Estado Lara.",
    },
    {
      name: "Barquisimeto Oeste",
      code: "7918",
      city: "Barquisimeto",
      address: "Calle 59 entre carreras 13 y 13 A, Barrio Nuevo, Local Nro SN, , Región Occidente, Lara, Barquisimeto, Municipio Iribarren, Código Postal 3001",
    },
    {
      name: "Barquisimeto Oeste Av. Las Industrias",
      code: "7918B",
      city: "Barquisimeto",
      address: "Av. Las Industrias, centro Comercial ISAAC, Local N 3, Región Occidente, Lara, Barquisimeto, Código Postal 3011",
    },
    {
      name: "Barquisimeto Sur",
      code: "7912",
      city: "Barquisimeto",
      address: "Carrera 22, entre Calle 14 y 15, Local Nº 1, Sector Centro Barquisimeto Lara Zona Postal 3001.",
    },
    {
      name: "Cabudare",
      code: "7915",
      city: "Cabudare",
      address: "AV. STA BARBARA CON CALLE GUILLERMO ALVIZU LOCAL NRO 2 CONJUNTO RESIDENCIAL STA BARBARA, Región Occidente, Lara, Cabudare, Municipio Palavecino, Código Postal 3001",
    },
    {
      name: "Carora",
      code: "7916",
      city: "Carora",
      address: "Calle Jos Luis Andrade entre Calle Carabobo y Av. Francisco de Miranda Local Nro 3 Zona Centro., Región Occidente, Lara, Carora, Código Postal 3050",
    },
    {
      name: "El Tocuyo",
      code: "J7901",
      city: "El Tocuyo",
      address: "",
    },
    {
      name: "Oficina Comercial Barquisimeto",
      code: "GG",
      city: "Barquisimeto",
      address: "Sector Enelvar, Edif. Profesional Barreto, Local 2, Calle 22, Esq. Carrera 23, Parroquia Catedra, Región Occidente, Lara, Barquisimeto, Código Postal 0",
    },
  ],
  "Mérida": [
    {
      name: "Bailadores – Tovar – Lagunillas – Santa Cruz De Mora",
      code: "J8305",
      city: "Tovar",
      address: "",
    },
    {
      name: "Caja Seca",
      code: "8204C",
      city: "Caja Seca",
      address: "Carretera Panamericana , local numero 2, sector Latino, Nueva Bolivia, Region Los Andes, Trujillo, Caja Seca, Código Postal 3158",
    },
    {
      name: "El Vigía",
      code: "8307",
      city: "El Vigia",
      address: "CALLE 9, CASA NRO 19 38, BARRIO SAN ISIDRO EL VIGIA ESTADO MERIDA, Región Occidente, Merida, El Vigia, Municipio Alberto Adriani, Código Postal 5145",
    },
    {
      name: "Merida",
      code: "8301B",
      city: "Mérida",
      address: "Calle 40 entre av Urdaneta y Gonzalo Picon, Region Los Andes, Mérida, Mérida, Código Postal 5101",
    },
    {
      name: "Merida Norte",
      code: "8308",
      city: "Mérida",
      address: "AV UNIVERSIDAD CASA NRO 84 SECTOR MILLA MERIDA , Region Los Andes, Mérida, Mérida, Municipio Libertador, Código Postal 5099",
    },
  ],
  "Miranda": [
    {
      name: "Boleíta",
      code: "1114",
      city: "Caracas",
      address: "Av. Principal de Boleíta Sur, entre 4ta. y 3ra. Transversal, Quinta La Campiña, Boleíta, Parroquia Leoncio Martínez, Municipio Sucre, Estado Miranda.",
    },
    {
      name: "Charallave",
      code: "1501",
      city: "Charallave",
      address: "Carretera Charallave-Cúa, Km. 1, C.C. Industrial Franfil, PB, Local 2, Parroquia Charallave, Municipio Cristóbal Rojas, Charallave, Estado Miranda.",
    },
    {
      name: "El Rosal – Chacao",
      code: "1137",
      city: "Caracas",
      address: "Chacao, Av. Libertador, Edif EXA, PB, Local 10, Urb. El Retiro, Municipio Chacao,, Estado Miranda.",
    },
    {
      name: "Filas De Mariches",
      code: "1132",
      city: "Caracas",
      address: "Carretera Petare Santa Lucía, Km. 9, Local N° 3, PB, Sector El Limoncito, Urb. Hacienda La Candelaria, Parroquia Filas de Mariche, Municipio Sucre, Estado Miranda.",
    },
    {
      name: "Guarenas",
      code: "1305",
      city: "Guarenas",
      address: "CALLE GUARENAS, CENTRO COMERCIAL GUARENASPLAZA, NIVEL 1, LOCAL 19, SECTOR GUARENAS, GUARENAS - MIRANDA ZONA POSTAL 1220",
    },
    {
      name: "Guatire",
      code: "1302",
      city: "Guatire",
      address: "Calle Ramón Alonzo Blanco, 2° Bolulevard Pueblo de Guatire, Local N° A-1, Parroquia Guatire, Municipio Zamora, Estado Miranda.",
    },
    {
      name: "Higuerote",
      code: "1503",
      city: "Higuerote",
      address: "AV 4A ENTRE LAS CALLES 10 Y 12 CENTRO COMERCIAL AMERICA NIVEL PB LOCAL PB , Gran Caracas, Miranda, Higuerote, Municipio Brion, Código Postal 1231",
    },
    {
      name: "La Trinidad",
      code: "1110",
      city: "Caracas",
      address: "Calle San Sebastián, C.C. Baruta, Nivel PB, Local 9, Urb. Charallavito, Gran Caracas, Estado Miranda.",
    },
    {
      name: "Los Teques",
      code: "1405B",
      city: "Los Teques",
      address: "VEN - República Bolivariana de Venezuela, Gran Caracas, Miranda, Los Teques, Av. Pedro Russo Ferrer, Sector El Tambor, \"CENTRO COMERCIAL LOS TEQUES\" LOCAL PB-C-2, Codigo Postal 1201",
    },
    {
      name: "Montecristo",
      code: "1114B",
      city: "Caracas",
      address: "Urb. Montecristo, Av. Primera de Montecristo, entre 3ra. y 4ta. Transv. Qta. Laura, PB, Parroquia Leoncio Martínez, Municipio Sucre, Gran Caracas, Estado Miranda.",
    },
    {
      name: "Prados Del Este",
      code: "1133",
      city: "Caracas",
      address: "Sector Prados del Este, Av. Río Paragua, C.C. La Pirámide, PB, Local 5-C, Municipio Baruta, Gran Caracas, Estado Miranda.",
    },
    {
      name: "San Antonio De Los Altos",
      code: "1405",
      city: "San Antonio De Los A",
      address: "VEN - República Bolivariana de Venezuela, Gran Caracas, Miranda, San Antonio De Los A, Av. Perimetral, C.C. Los Castores, Edif. E, Local L-E, , Codigo Postal 1204",
    },
    {
      name: "Santa Teresa",
      code: "J1503",
      city: "Santa Teresa",
      address: "",
    },
  ],
  "Monagas": [
    {
      name: "El Tejero Punta De Mata El Furrial",
      code: "",
      city: "",
      address: "",
    },
    {
      name: "Maturín Este (c.c. Juanico)",
      code: "3005",
      city: "Maturin",
      address: "Calle Florida, C.C. Juanico Este, PB, Local 03, Maturín, Estado Monagas.",
    },
    {
      name: "Oficina Comercial Maturín",
      code: "RR",
      city: "Maturin",
      address: "Av. Miranda, Calle 12 con Carrera 11. Edif. TEALCA PB, San Simon Centro, Maturin, Municipio Maturin,, Region Oriente, Monagas, Maturin, Municipio Maturin, Cuidad Bolivia, Código Postal 6201",
    },
    {
      name: "Temblador",
      code: "",
      city: "",
      address: "",
    },
    {
      name: "Tipuro",
      code: "3007",
      city: "Maturin",
      address: "CALLE ARQUIMEDEZ CEDENO LOCAL EDIF. SN NRO 2 SECTOR TIPURO, Region Oriente, Monagas, Maturin, Municipio Maturin, Código Postal 6201",
    },
  ],
  "Nueva Esparta": [
    {
      name: "Cocheima",
      code: "2706C",
      city: "La Asuncion",
      address: "Local 4, Edificio D planta baja, ubicado en terreno Mama Pancha Sector Cocheima , Region Oriente, Nueva Esparta, Código Postal 6301",
    },
    {
      name: "Juan Griego",
      code: "2706B",
      city: "Juan Griego",
      address: "Local Plaza Central, C.C. La Estancia, Av. 3 de Mayo, Local PC, Juan Griego, Nueva Esparta.",
    },
    {
      name: "Porlamar",
      code: "2706",
      city: "Los Robles",
      address: "Av. Jovito Villalva, local estacion de servicio Los Robles Nro. 09, Sector Los Robles El Pilar , Region Oriente, Nueva Esparta, Los Robles, Código Postal 6307",
    },
  ],
  "Portuguesa": [
    {
      name: "Acarigua",
      code: "5401B",
      city: "Acarigua",
      address: "Calle 30, cruce con Av. 35, C.C. Páez, Nivel PB, Local 15, sector Centro, Acarigua, Estado Portuguesa.",
    },
    {
      name: "Guanare",
      code: "7705",
      city: "Guanare",
      address: "Av. Corredor vial tomas Montilla, con Av Bolívar Centro comercial giramara local 13, Barrio Maturín, municipio Guanare, Guanare Estado Portuguesa, zona postal 3350",
    },
  ],
  "Sucre": [
    {
      name: "Carupano",
      code: "2803",
      city: "Carupano",
      address: "Calle Independencia, cruce con calle Acosta y Calle Carabobo, C.C. Cristal Nivel PB Local A2, Region Oriente, Sucre, Carupano, Municipio Bermudez, Código Postal 6150",
    },
    {
      name: "Cumaná",
      code: "2802",
      city: "Cumana",
      address: "Av. Arístides Rojas (Av. Perimetral), C.C. Marigamar, PB, Local 1, Sector Don Bosco, Parroquia Ayacucho, Municipio Sucre, Cumaná, Estado Sucre.",
    },
  ],
  "Táchira": [
    {
      name: "Capacho",
      code: "8115C",
      city: "Capacho",
      address: "Carrera 5, Nro 348, Local N 1, Capacho Nuevo, Barrio Bella Vista, Municipio Independencia, Region Los Andes, Táchira, Capacho, Código Postal 5010",
    },
    {
      name: "La Fria",
      code: "8113",
      city: "La Fria",
      address: "CR 11 ESQUINA, CALLE 5 CASA NR 475 SECTOR CASCO CENTRAL, Region Los Andes, Tachira, La Fria, Seleccione Municipio, Código Postal 5020",
    },
    {
      name: "La Grita",
      code: "J8132",
      city: "La Grita",
      address: "",
    },
    {
      name: "Paramillo",
      code: "8112",
      city: "San Cristobal",
      address: "Av. La ULA, casa Nº2, Urb. Villa Hermosa, sector Santa Cecilia, San Cristóbal, Estado Táchira.",
    },
    {
      name: "San Antonio Del Tachira",
      code: "8112B",
      city: "San Antonio Del Tach",
      address: "AV VENEZUELA ESQ CON CARRERA 6 LOCAL COMERCIAL EDIFICIO RA PISO 1 LOCAL N 4 N 6 02, Region Los Andes, Táchira, San Antonio Del Tach, Municipio Bolivar, Código Postal 5007",
    },
    {
      name: "San Cristobal",
      code: "8115",
      city: "San Cristobal",
      address: "AV. CUATRICENTENARIA, LOCAL NRO H40, SECTOR CUATRICENTENARIA, Region Los Andes, Táchira, San Cristobal, Municipio San Cristobal, Código Postal 5001",
    },
    {
      name: "San Cristóbal (barrio Obrero)",
      code: "8111",
      city: "San Cristobal",
      address: "Carrera 16, esquina calle 13 de Barrio Obrero, N° 12-83, San Cristóbal, Edo. Táchira.",
    },
    {
      name: "San Cristóbal Sur",
      code: "8114",
      city: "San Cristobal",
      address: "CALLE 4 ENTRE CARRERAS 7 Y 8 LOCAL NRO 7 54 SECTOR LA CONCORDIA , Region Los Andes, Tachira, San Cristobal, Municipio San Cristobal, Código Postal 5001",
    },
    {
      name: "Tariba",
      code: "8115B",
      city: "Tariba",
      address: "Carretera 4, entre calles 4 y 5, Casa N 451, Ciudad de Táriba, Municipio Cárdenas, Region Los Andes, Táchira, Tariba, Municipio Cardenas, Código Postal 5017",
    },
    {
      name: "Ureña",
      code: "8107",
      city: "Ureña",
      address: "Barrio La Guajira, Calle 5, Casa N 5-13, Region Los Andes, Táchira, Ureña, Municipio Pedro Maria Urena, Código Postal 5048",
    },
  ],
  "Trujillo": [
    {
      name: "Valera",
      code: "8204",
      city: "Valera",
      address: "Sector Las Acacias, Av. Bolívar, entre calles 17 y 18, Edif. San Rafael, PB, Local 1, Parroquia Juan Ignacio Montilla, Municipio Valera, Valera, Estado Trujillo.",
    },
    {
      name: "Valera-Centro",
      code: "8204B",
      city: "Valera",
      address: "Av. 12, esquina con Calle 4, Nivel PB, C.C. Adriático, Local N° 12, Municipio Valera, Estado Trujillo.",
    },
  ],
  "Yaracuy": [
    {
      name: "San Felipe",
      code: "7802",
      city: "San Felipe",
      address: "Calle 16 entre avenidas 5 y 6, Local Nro. 3 Sector Centro San Felipe Edo Yaracuy , Region Centro, Yaracuy, San Felipe, Código Postal 3201",
    },
    {
      name: "Yaritagua",
      code: "J7917",
      city: "Yaritagua",
      address: "",
    },
    {
      name: "Yaritagua",
      code: "J7804",
      city: "Yaritagua",
      address: "",
    },
  ],
  "Zulia": [
    {
      name: "Bella Vista 5 De Julio",
      code: "8502",
      city: "Maracaibo",
      address: "Sector Santa Lucía, Av. 4 Bella Vista, Esq. Calle 79, Local C, C.C. Shalon, Local 7, Parroquia Santa Lucía, Maracaibo, Estado Zulia.",
    },
    {
      name: "Cabimas",
      code: "8405",
      city: "Cabimas",
      address: "Carretera H, C.C. Borjas (Centro 99), Local PB, Parroquia Carmen Herrera, Municipio Cabimas, Cabimas, Estado Zulia.",
    },
    {
      name: "Ciudad Ojeda",
      code: "8406",
      city: "Ciudad Ojeda",
      address: "Sector Las Morochas, Av. Intercomunal, Edificio Comercial Tamare, Local 2, Parroquia Alonso de Ojeda, Municipio Lagunillas, Ciudad Ojeda, Estado Zulia.",
    },
    {
      name: "Delicias 5 De Julio",
      code: "8502B",
      city: "Maracaibo",
      address: "Las Delicias, Av. 15 entre calles 74 y 75, Parroquia Olegario Villalobos, Municipio Maracaibo, Maracaibo, Estado Zulia.",
    },
    {
      name: "Dr. Portillo",
      code: "8511",
      city: "Maracaibo",
      address: "Paraso Calle 78 Dr. Portillo, entre calles 18 y 19 N 1850, Locales 3 y 4, Región Occidente, Zulia, Maracaibo, Municipio Maracaibo, Código Postal 0",
    },
    {
      name: "Machiques Villa Del Rosario",
      code: "J8516",
      city: "Villa Del Rosario",
      address: "",
    },
    {
      name: "Maracaibo Centro Cc Gran Bazar",
      code: "8511B",
      city: "Maracaibo",
      address: "CENTRO COMERCIAL GRAN BAZAR PB LOCAL ML 2124 CALLE 100 CON AV 15 DELICIAS , Región Occidente, Zulia, Maracaibo, Código Postal 4001",
    },
    {
      name: "Maracaibo Circunvalacion 2 Sur Oeste",
      code: "8513B",
      city: "Maracaibo",
      address: "Av Circunvalación 2 con Av 58, Edificio Mix Aoroa pb local 10, sector San Miguel, Maracaibo Zulia.",
    },
    {
      name: "Maracaibo Delicias Norte Centro Comercial El Pilar",
      code: "8513C",
      city: "Maracaibo",
      address: "Av Delicias Entre calles 59 y 60B CC el pilar local 5 al lado de ippluz Maracaibo estado Zulia",
    },
    {
      name: "Maracaibo Norte",
      code: "8514",
      city: "Maracaibo",
      address: "Codigo Postal 4005, Barrio San Agustín Av. 16 Goajira C/C 46 Casa 46_ 10 Local 2, Municipio Maracaibo, Maracaibo, Zulia, Región Occidente, VEN - República Bolivariana de Venezuela",
    },
  ],
};

/**
 * Índice de oficinas Tealca por nombre normalizado (para búsqueda O(1)).
 */

/**
 * Índice de oficinas Tealca por código (para búsqueda O(1)).
 * Clave: código de la oficina, o "{state}-{name}" si no tiene código.
 */
export const tealcaOfficeIndex: Record<string, TealcaOffice & { state: string }> = {};
for (const [state, offices] of Object.entries(tealcaOffices)) {
  for (const office of offices) {
    const key = office.code !== "" ? office.code : normalize(state + "-" + office.name);
    tealcaOfficeIndex[key] = { ...office, state };
  }
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}