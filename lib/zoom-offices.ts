/**
 * Lista blanca oficial de oficinas ZOOM por estado (paralela a lib/mrw-offices.ts).
 * Fuente: directorio oficial de oficinas ZOOM ("Encuentra tu Oficina").
 * Cada oficina incluye nombre, direccion completa y ciudad.
 * El estado se infiere de la ciudad/direccion de cada oficina.
 */
export interface ZoomOffice {
  /** Nombre de la oficina ZOOM. */
  name: string;
  /** Direccion completa y especifica de la oficina. Vacio si no esta en el directorio. */
  address: string;
  /** Ciudad donde se ubica la oficina. */
  city: string;
}

export const zoomOffices: Record<string, ZoomOffice[]> = {
  Amazonas: [
    {
      name: "Av Orinoco",
      address:
        "AV. ORINOCO EDIF EL REY PISO P.B LOCAL N°02 ZONA CENTRO PUERTO AYACUCHO",
      city: "Puerto Ayacucho",
    },
    {
      name: "Puerto Ayacucho",
      address:
        "AV. RIO NEGRO, CENTRO COMERCIAL JUNCOSA, LOCAL 2-A. PUERTO AYACUCHO",
      city: "Puerto Ayacucho",
    },
  ],
  Anzoátegui: [
    {
      name: "Amana",
      address:
        "CALLE BOLIVAR CRUCE CON CALLE MANEIRO. CENTRO COMERCIAL AMANA LOCAL PB A-6 PUERTO LA CRUZ",
      city: "Puerto la Cruz",
    },
    {
      name: "Anaco",
      address:
        "CALLE 5 DE JULIO, EDF. SAN ELIAS NRO 3-23B PB. P.REF. UNA CUADRA DE BANESCO. ANACO",
      city: "Anaco",
    },
    {
      name: "Anaco Center",
      address:
        "AV. JOSE ANTONIO ANZOATEGUI. C.C ANACO CENTER PISO 1 LOCAL 75-S.A ANACO",
      city: "Anaco",
    },
    {
      name: "Barcelona",
      address:
        "AV. INTERCOMUNAL JORGE RODRIGUEZ, C.C. BRISAS DEL NEVERI, LOCAL 04. P.REF. FRENTE A LA ESCUELA DE INGENIERIA UGMA. BARCELONA",
      city: "Barcelona",
    },
    {
      name: "C.C Alba",
      address:
        "AV FRANCISCO DE MIRANDA CC C.C ALBA NIVEL BAJA LOCAL NRO 8 EL TIGRE",
      city: "El Tigre",
    },
    {
      name: "C.C Judibana",
      address:
        "AV STADIUM C.C JUDIBANA NIVEL PB LOCAL, SECTOR CHUPARIN PUERTO LA CRUZ",
      city: "Puerto la Cruz",
    },
    {
      name: "Calle 20 Sur",
      address: "CALLE 20 SUR, CRUCE CON 5TA CARRERA BIS EL TIGRE",
      city: "El Tigre",
    },
    {
      name: "Calle Guaraguao",
      address:
        "CALLE LAS FLORES CON CALLE GUARAGUAO, CENTRO COMERCIAL CARABEL, PLANTA BAJA, LOCAL 2 PUERTO LA CRUZ",
      city: "Puerto la Cruz",
    },
    {
      name: "Camino Real",
      address:
        "AV COSTANERA CON AV FUERZAS ARMADAS C.C CAMINO REAL NIVEL PLAZA PB LOCAL C11, SECTOR NUEVA BARCELONA BARCELONA",
      city: "Barcelona",
    },
    {
      name: "Cantaura Centro",
      address:
        "CALLE ARISMENDI EDIF ERYMAR PISO PB LOCAL S/N, SECTOR CENTRO CANTAURA CANTAURA",
      city: "Cantaura",
    },
    {
      name: "Casco Central Lecheria",
      address:
        "SECTOR CASCO CENTRAL LECHERIAS CARRERA 5 ENTRE CALLE 2 Y 3 CENTRO EMPRESARIAL 17-11 LOCAL PB-1 LECHERIAS",
      city: "Lecherias",
    },
    {
      name: "Central Madeirense",
      address:
        "AV MUNICIPAL CC CENTRAL MADEIRENSE NIVEL PB LOCAL 17, SECTOR PUEBLO NUEVO PUERTO LA CRUZ",
      city: "Puerto la Cruz",
    },
    {
      name: "Centro Anaco",
      address: "CALLE MONAGAS CASA NRO 1-16 SECTOR LAS PARCELAS ANACO",
      city: "Anaco",
    },
    {
      name: "Colina del Neveri",
      address:
        "CALLE RUIZ PINEDA EDIF VELASQUEZ PISO PB-02 URB COLINAS DEL NEVERI BARCELONA",
      city: "Barcelona",
    },
    {
      name: "El Tigre",
      address:
        "AV. FCO. DE MIRANDA, CENTRO COMERCIAL FLAMINGO, PB. LOCALES A-07 Y A-08. P.REF. AL LADO DE LA ALCALDIA. EL TIGRE",
      city: "El Tigre",
    },
    {
      name: "El Tigrito",
      address:
        "AV FERNANDEZ PADILLA CC DECA NIVEL N/A LOCAL LOCAL 3 ZONA SAN JOSE DE GUANIPA EL TIGRITO",
      city: "El Tigrito",
    },
    {
      name: "Hotel Rasil",
      address:
        "AV. PASEO COLON EDIF. HOTEL RASIL PISO, 1 LOCAL NRO 02 SECTOR, PUERTO LA CRUZ. PUERTO LA CRUZ",
      city: "Puerto la Cruz",
    },
    {
      name: "La Concha Lecheria",
      address:
        "AV PRINCIPAL CC LA CONCHA NIVEL S/N LOCAL 17, SECTOR CIUDAD DE LECHERIAS LECHERIAS",
      city: "Lecherias",
    },
    {
      name: "Pueblo Nuevo Norte",
      address: "CALLE 18 NORTE LOCAL NRO 04 SECTOR PUEBLO NUEVO NORTE EL TIGRE",
      city: "El Tigre",
    },
    {
      name: "Puerto Piritu",
      address:
        "CALLE BOLIVAR CC ZEGHEN INVERSIONES GEORGINA NIVEL PB LOCAL 06, 08 Y 10, SECTOR CENTRO PUERTO PIRITU",
      city: "Puerto Piritu",
    },
    {
      name: "Terminal Pasajeros",
      address:
        "CALLE DEMOCRACIA CRUCE CON CALLE JUNCAL, LOCAL DENTRO DEL TERMINAL DE PASAJEROS DE PUERTO LA CRUZ NRO LOCAL 71 PASILLO 6. PUERTO LA CRUZ",
      city: "Puerto la Cruz",
    },
    {
      name: "Valle Alto",
      address:
        "AV PRINCIPAL DEL SAMAN CC VALLE ALTO NIVEL PB LOCAL NRO 12, SECTOR EL SAMÁN BARCELONA",
      city: "Barcelona",
    },
    {
      name: "Venecia",
      address:
        "AV NUEVA ESPARTA C.C NASCAR NIVEL PB LOCAL 06, SECTOR VENECIA BARCELONA",
      city: "Barcelona",
    },
  ],
  Apure: [
    {
      name: "Avenida Paseo Libertador",
      address:
        "AV PASEO LIBERTADOR EDIF DOÑA ISABEL PISO SN LOCAL SN SAN FERNANDO",
      city: "San Fernando",
    },
    {
      name: "Biruaca",
      address:
        "AV. LAS ACACIAS, LOCAL N°. 2, SECTOR ENCRUCIJADA DE BIRUACA APURE. BIRUACA",
      city: "Biruaca",
    },
    {
      name: "San Fernando de Apure",
      address:
        "EDIFICIO LARA, PLANTA BAJA CALLE BOLíVAR, CRUCE CON CALLE 24 DE JULIO. SAN FERNANDO",
      city: "San Fernando",
    },
  ],
  Aragua: [
    {
      name: "Amani Calle Comercio",
      address:
        "CALLE COMERCIO CRUCE CON CALLE SUCRE EDIF AMANI PISO PB LOCAL 104-70-17, SECTOR CENTRO CAGUA CAGUA",
      city: "Cagua",
    },
    {
      name: "Aragua",
      address: "",
      city: "Maracay",
    },
    {
      name: "Av. Bermudez Tacita de Plata",
      address:
        "AV BERMUDEZ CRUCE CON AVENIDA 10 DE DICIEMBRE EDIF DEL PINTO PISO LOCAL B MARACAY",
      city: "Maracay",
    },
    {
      name: "Avenida 19 de Abril",
      address:
        "AV 19 DE ABRIL, C.C MERCADO ATENEO PASILLO F LOCAL F-08 SECTOR CENTRO MARACAY",
      city: "Maracay",
    },
    {
      name: "Base Aragua",
      address:
        "AV. LAS DELICIAS CC Y HOTEL PASEO LAS DELICIAS, NIVEL PB, LOCALES 2-PB-22, URB. BASE ARAGUA MARACAY MARACAY",
      city: "Maracay",
    },
    {
      name: "C.C Ipsfa-Maracay",
      address: "AV BOLIVAR ESTE CC LOS PROCERES NIVEL PB LOCAL PCB-15 MARACAY",
      city: "Maracay",
    },
    {
      name: "C.C Maracay Plaza",
      address:
        "AV. BERMUDEZ, CRUCE CON AV. ARAGUA, C.C. MARACAY PLAZA, NIVEL PLANTA BAJA, LOCAL 61-D. MARACAY",
      city: "Maracay",
    },
    {
      name: "C.C las Americas",
      address:
        "AV LAS DELICIAS, CENTRO COMERCIAL LAS AMERICAS LOCALES NROS M1-428 Y M1-428A MEZZANINA UNO (M1) MARACAY",
      city: "Maracay",
    },
    {
      name: "Cagua",
      address:
        "SECTOR CENTRO, CALLE RONDON C/C CALLE BERMUDEZ NRO 104- 03-07, LOCAL L-3. CAGUA",
      city: "Cagua",
    },
    {
      name: "Colonia Tovar",
      address:
        "SECTOR PLAN DE MORENO, CARRETERA PRINCIPAL PLAN DE MORENO, C.C. PARQUE MORITZ, NIVEL 1, LOCAL N1-3. COLONIA TOVAR",
      city: "Colonia Tovar",
    },
    {
      name: "El Limon",
      address:
        "SECTOR EL LIMON, AV. UNIVERSIDAD, C.C. EL LIMON, NIVEL PB, LOCAL NRO. 03 EL LIMON",
      city: "El Limon",
    },
    {
      name: "Fuerzas Aéreas-Las Acacias",
      address: "AV FUERZAS AEREAS, URB MARIO BRICEÑO IRAGORRI, NRO 93 MARACAY",
      city: "Maracay",
    },
    {
      name: "Hyper Jumbo",
      address:
        "AV. FUERZAS AEREAS C/C AV. JOSE CASANOVA GODOY, C.C HYPER JUMBO, NIVEL SOTANO MARACAY",
      city: "Maracay",
    },
    {
      name: "La Morita",
      address:
        "CALLE CALLE LEONARDO RUIZ PINEDA LOCAL NRO 11 SANTA RITA - ARAGUA",
      city: "Santa Rita",
    },
    {
      name: "La Victoria",
      address:
        "CALLE RIVAS DAVILA, C.C. VICTORIA CENTER, PRIMERA ETAPA, NIVEL PLANTA BAJA, LOCAL A-6. LA VICTORIA",
      city: "La Victoria",
    },
    {
      name: "Los Aviadores",
      address:
        "CALLE OESTE DEL PARCELAMIENTO CIUDAD LIBERTADOR, FRENTE A LA AVENIDA LOS AVIADORES CENTRO COMERCIAL PARQUE LOS AVIADORES, PARCELA 2-A1 LOCAL COMERCIAL L-218, SECTOR NORTE MARACAY",
      city: "Maracay",
    },
    {
      name: "Maracay Av. Miranda",
      address:
        "AV. MIRANDA OESTE, CRUCE CON CALLE CAMPO ELIAS NRO 165. MARACAY",
      city: "Maracay",
    },
    {
      name: "Santa Cruz de Aragua",
      address:
        "AV 02 CASA PARCELA B-17-A Y B-17-B ZONA INDUSTRIAL SANTA CRUZ SANTA CRUZ DE ARAGUA",
      city: "Santa Cruz de Aragua",
    },
    {
      name: "Santa Rita Aragua",
      address:
        "AV FRANCISCO DE MIRANDA NRO 75 LOCAL CENTRO COMERCIAL ACCA NRO 02, SECTOR GUARUTO 2 SANTA RITA SANTA RITA - ARAGUA",
      city: "Santa Rita",
    },
    {
      name: "Sector San Miguel",
      address:
        "AV. MARINO SUR, CENTRO EMPRESARIAL UNIARAGUA, PLANTA BAJA, LOCAL 1. MARACAY",
      city: "Maracay",
    },
    {
      name: "Turmero Centro",
      address:
        "SECTOR CENTRO TURMERO, CALLE URDANETA CASA NRO. 16 Y NRO. 1. TURMERO",
      city: "Turmero",
    },
    {
      name: "Turmero Encrucijada",
      address:
        "CARRETERA NACIONAL TURMERO - CAGUA CENTRO COMERCIAL PASEO LOS LAURELES NIVEL PB LOCAL 4. URB. LA ENCRUCIJADA. TURMERO",
      city: "Turmero",
    },
    {
      name: "Turmero Intercomunal",
      address:
        "AV INTERCOMUNAL MARACAY-TURMERO CC INTERCOMUNAL CENTER NIVEL LOCAL 1-7, SECTOR LA MORITA TURMERO",
      city: "Turmero",
    },
    {
      name: "Villa de Cura",
      address:
        "CALLE SUCRE CON ADUANA, C.C. VILLA HERMOSA, LOCAL 39. VILLA DE CURA",
      city: "Villa de Cura",
    },
  ],
  Barinas: [
    {
      name: "Alto Barinas Norte",
      address:
        "ALTO BARINAS NORTE, AVENIDA COLOMBIA, LOCAL 80-C, FRENTE AL GOLFITO. BARINAS",
      city: "Barinas",
    },
    {
      name: "Alto Barinas Sur",
      address:
        "AVENIDA LOS LLANOS C.C SION PB LOCAL 5 ALTO BARINAS SUR FARMACIA BETANIA C.A (QIARIS FARMACIA) BARINAS",
      city: "Barinas",
    },
    {
      name: "Barinas",
      address:
        "AV. ELIAS CORDERO, N° 1- 120. P.REF. FRENTE A SUELAPIEL. BARINAS",
      city: "Barinas",
    },
    {
      name: "Barinas Centro",
      address:
        "SECTOR BARRIO OBRERO, CALLE CAMEJO ENTRE AVENIDAS MONTILLA Y OLMEDILLA, EDIFICIO LOS HERMANOS. BARINAS",
      city: "Barinas",
    },
    {
      name: "La Carolina",
      address:
        "AV ANDRES VARELA LOCAL ESTADIO AGUSTIN TOVAR LA CAROLINA NRO A1, SECTOR LA CAROLINA BARINAS",
      city: "Barinas",
    },
    {
      name: "Santa Barbara",
      address:
        "SECTOR PUEBLO VIEJO, CARRERA 5, ENTRE CALLES 9 Y 10. SANTA BARBARA DE BARINAS",
      city: "Santa Barbara de Barinas",
    },
    {
      name: "Socopo",
      address:
        "CR 9 ENTRE CALLES 3 Y 4 CC GALERIAS NIVEL PB LOCAL NRO 2 SECTOR CENTRO SOCOPO SOCOPO",
      city: "Socopo",
    },
    {
      name: "Varyna Alto Barinas Sur",
      address:
        "AV. VENEZUELA CON CALLE JUSTICIA LOCAL, NRO. 127 B-3, URB, ALTO BARINAS SUR BARINAS BARINAS",
      city: "Barinas",
    },
  ],
  Bolívar: [
    {
      name: "Av Germania",
      address:
        "SECTOR GERMANIA, AV. GERMANIA, C.C. LOS PROCERES NIVEL PB, LOCAL ANEXO ESTACIONAMIENTO. CIUDAD BOLIVAR",
      city: "Ciudad Bolivar",
    },
    {
      name: "Av Republica",
      address:
        "AV SIEGART CON AV. REPUBLICA EDIF IVANNA PISO P/B. LOCAL NRO 1 SECTOR AV. REPUBLICA PARROQUIA CATEDRAL MUNICIPIO AGOSTURA DEL ORINOCO CIUDAD BOLIVAR",
      city: "Ciudad Bolivar",
    },
    {
      name: "Av Venezuela Centro",
      address:
        "AV VENEZUELA CON CIUDAD BOLIVAR EDIF CENTRO RESIDENCIAL Y EMPRESARIAL PARQUE DEL CENTRO PISO PB LOCAL 5-L2, ZONA CENTRO DE PUERTO ORDAZ. PUERTO ORDAZ",
      city: "Puerto Ordaz",
    },
    {
      name: "Av. Paseo Meneses",
      address:
        "PASEO MENESES, EDIFICIO H-BOCCARDO, LOCAL 3, SECTOR MERCADO PERIFÉRICO CIUDAD BOLIVAR",
      city: "Ciudad Bolivar",
    },
    {
      name: "C.C Gran Sabana",
      address:
        "AV PASEO CARONI CENTRO COMERCIAL GRAN SABANA PLANTA BAJA NRO 07 SECTOR UD-305 PUERTO ORDAZ",
      city: "Puerto Ordaz",
    },
    {
      name: "C.C Plaza Atlantico",
      address:
        "AV. ATLÁNTICO, CC PLAZA ATLÁNTICO, NIVEL ATLÁNTICO, LOCAL PB- 48-B, URB LOMAS DEL CARONÍ PUERTO ORDAZ",
      city: "Puerto Ordaz",
    },
    {
      name: "C.C la Favorita",
      address:
        "AV BICENTENARIA, CENTRO DE INVERSIONES LA FAVORITA LOCAL 2 P.B UPATA",
      city: "Upata",
    },
    {
      name: "Ciudad Bolivar",
      address:
        "AV. JESUS SOTO CON CALLE CAURA, C.C. TEPUY, LOCAL 1 Y 2, PB. CIUDAD BOLIVAR",
      city: "Ciudad Bolivar",
    },
    {
      name: "El Callao Charito",
      address:
        "VDA CALLEJON GAZZANEO ENTRE CALLE BOLIVAR Y CALLE RICAURE LOCAL NRO 1 EL CALLAO",
      city: "El Callao",
    },
    {
      name: "El Callao la Hormiga",
      address: "CALLE BOLIVAR DIAGONAL A LA POLICíA LOCAL S/N CALLAO EL CALLAO",
      city: "El Callao",
    },
    {
      name: "Guasipati",
      address:
        "CALLE MERIDA CC CLEMENT NIVEL 1 LOCAL NRO 5-6, SECTOR LAS GRACIAS GUASIPATI GUASIPATI",
      city: "Guasipati",
    },
    {
      name: "Hangar Distribuidora",
      address:
        "AV. JESUS SOTO LOCAL HANGAR DISTRIBUIDORA TOMS. C.A NRO S/N CIUDAD BOLIVAR",
      city: "Ciudad Bolivar",
    },
    {
      name: "Orinokia Mall",
      address:
        "URB. ALTA VISTA, AV. PROLONGACION, AV. LAS AMERICAS, C.C. ORINOKIA MALL NIVEL PLAZA, SANTO TOME LOCAL PB-04. PUERTO ORDAZ",
      city: "Puerto Ordaz",
    },
    {
      name: "Puerto Ordaz",
      address:
        "SECTOR UNARE, ZONA INDUSTRIAL I, CALLE TUNAPUY, P.REF. DIAGONAL AL TIGASCO. PUERTO ORDAZ",
      city: "Puerto Ordaz",
    },
    {
      name: "San Felix",
      address:
        "SECTOR EL ROBLE, AV. MORENA MENDOZA, CENTRO COMERCIAL LA CARIÑOSA, LOCAL C. SAN FELIX",
      city: "San Felix",
    },
    {
      name: "Taquilla Cc Artica",
      address:
        "CENTRO COMERCIAL ARTICA, CARRERA GUASIPATI, LOCALES 5 Y 6. CENTRO DE PUERTO ORDAZ. PUERTO ORDAZ",
      city: "Puerto Ordaz",
    },
    {
      name: "Torre Caura",
      address:
        "CTRA TOCOMA, CON CALLE CAURA CC C.C TORRE CAURA NIVEL SOTANO LOCAL 4 SECTOR ALTA VISTA PUERTO ORDAZ",
      city: "Puerto Ordaz",
    },
    {
      name: "Tumeremo Calle Bolivar",
      address:
        "CALLE SUR ESTE, CALLE ZEA CRUCE CON CALLE MARTÍ, LOCAL NÚMERO 01 TUMEREMO",
      city: "Tumeremo",
    },
    {
      name: "Upata C.C Datil",
      address:
        "AV BICENTENARIO DIAGONAL CALLE 19 DE ABRIL CC EL DATIL NIVEL PB LOCAL S/N SECTOR CENTRO UPATA",
      city: "Upata",
    },
    {
      name: "Villa Africana",
      address:
        "C.C GIGIA LOCAL 1, URB VILLA AFRICANA ENTRE VIA ITALIA Y CALLE EGIPTO, DE LA CIUDAD DE PUERTO ORDAZ, MUNICIPIO PUERTO ORDAZ",
      city: "Puerto Ordaz",
    },
  ],
  Carabobo: [
    {
      name: "Av Lisandro Alvarado",
      address:
        "AV LISANDRO ALVARADO CON CALLE PADRE BEGERETTI CC TORINOCO 83-19 NIVEL PB LOCAL 12 VALENCIA",
      city: "Valencia",
    },
    {
      name: "Av Michelena",
      address: "CALLE 91 CASA NRO 90-63, URB MICHELENA, SAN BLAS VALENCIA",
      city: "Valencia",
    },
    {
      name: "Av Montes de Oca Centro",
      address:
        "AV 102 MONTE DE OCA CALLE 24 DE JUNIO Y CALLE GIRARDOT NRO CIVICO 96-24 CASA NRO 5-A VALENCIA",
      city: "Valencia",
    },
    {
      name: "Av. Bolivar Norte",
      address:
        "AV. BOLIVAR NORTE, EDF. DON ENRIQUE PB. P.REF. FRENTE A LA FUNERARIA LA SUPERIOR A 100 MTS DEL ATENEO DE VALENCIA. VALENCIA",
      city: "Valencia",
    },
    {
      name: "Bejuma",
      address:
        "AV SUCRE C/C CALLE HERES LOCAL NRO SECTOR PUEBLO NUEVO LA UNIÓN BEJUMA",
      city: "Bejuma",
    },
    {
      name: "Big Low San Diego",
      address:
        "AV. BOULEVARD NORTE 102 CENTRO COMERCIAL BOULEVARD NORTE LOCAL NRO. 3 URB. SAN DIEGO. VALENCIA",
      city: "Valencia",
    },
    {
      name: "C.C Aerocentro",
      address:
        "AV. LUIS ERNESTO BRANGER, ZONA INDUSTRIAL MUNICIPAL SUR, CONJ. EMPRESARIAL ENTRADA F, PB-5. VALENCIA",
      city: "Valencia",
    },
    {
      name: "C.C Caribean Plaza",
      address:
        "SECTOR CAMORUCO, CALLE SAN JORGE, C.C. CARIBBEAN PLAZA, PB, LOCAL 171, MODULO 8. VALENCIA",
      city: "Valencia",
    },
    {
      name: "C.C Central Guacara",
      address:
        "CARRETERA NACIONAL GUACARA LOS GUAYOS, CENTRO COMERCIAL CENTRAL GUACARA PB LOCAL 18 Y 20 GUACARA",
      city: "Guacara",
    },
    {
      name: "C.C Fin de Siglo",
      address:
        "SECTOR SAN DIEGO, AV. DON JULIO CENTENO, C.C. SAN DIEGO (FIN DE SIGLO), NIVEL GALERIA NRO. 3, LOCAL NRO. 1 Y NRO. 2. VALENCIA",
      city: "Valencia",
    },
    {
      name: "C.C Guacara Plaza",
      address: "CALLE PIAR C.C GUACARA PLAZA NIVEL PB LOCAL PB-09 GUACARA",
      city: "Guacara",
    },
    {
      name: "C.C Metropolis",
      address:
        "AUTOPISTA REGIONAL DEL CENTRO. ENTRADA DE VALENCIA, AL LADO DE MAKRO.CENTRO COMERCIAL METROPOLIS NIVEL CIELO, LOCAL A1-300B VALENCIA",
      city: "Valencia",
    },
    {
      name: "C.C Naguanagua",
      address:
        "AV UNIVERSIDAD CC NAGUANAGUA NIVEL PB LOCAL 28 SECTOR LA CAMPIÑA VALENCIA",
      city: "Valencia",
    },
    {
      name: "C.C Paraparal",
      address:
        "AV PRINCIPAL DE PARAPARAL CC GALERIAS, PLANTA BAJA NIVEL A LOCAL A-6 URB PARAPARAL LOS GUAYOS",
      city: "Los Guayos",
    },
    {
      name: "C.C Paseo las Industrias",
      address:
        "AV HENRY FORD CC PASEO LAS INDUCTRIAS NIVEL PB LOCAL 7, ZONA INDUSTRIAL SUR VALENCIA",
      city: "Valencia",
    },
    {
      name: "C.C la Galeria",
      address:
        "CALLE 137 CC LA GALERIA NAVE A NIVEL PB LOCAL 1-A6, URB CAMORUCO VALENCIA",
      city: "Valencia",
    },
    {
      name: "Cc Cristal Naguanagua",
      address:
        "AV FEO LA CRUZ C.C CRISTAL PB, LOCAL PBA08, URB LAS QUINTAS VALENCIA",
      city: "Valencia",
    },
    {
      name: "Flor Amarillo",
      address:
        "SECTOR FLOR AMARILLO, AV. NRO. 107-C, C.C. LA FUNDACION, LOCAL NRO. 1. VALENCIA",
      city: "Valencia",
    },
    {
      name: "La Candelaria Valencia",
      address:
        "VALENCIA CENTER PB, LOCAL NRO 38, AL FRENTE DEL COLEGIO REPUBLICA DEL PERU, DETRAS DEL REGISTRO CIVIL. VALENCIA",
      city: "Valencia",
    },
    {
      name: "La Isabelica",
      address:
        "AV 73 HUMBERTO CELLI NRO 84-50 LOCAL 17 CENTRO COMERCIAL METRO SUR ZONA INDUSTRIAL MUNICIPAL NORTE. VALENCIA",
      city: "Valencia",
    },
    {
      name: "Los Guayos",
      address:
        "CALLE PAEZ ENTRE BRUZUAL Y NEGRO PRIMERO, LOCAL A-01. LOS GUAYOS",
      city: "Los Guayos",
    },
    {
      name: "Montalban Carabobo",
      address: "AV. BOLIVAR LOCAL NRO. 2 SECTOR CENTRO MONTALBAN MONTALBAN",
      city: "Montalban",
    },
    {
      name: "Puerto Cabello",
      address:
        "PRIMERA CALLE SEGRESTAA, EDIFICIO ENNA, PB., LOCAL 26 Y 27.P.REF. DIAGONAL A LA CRUZ ROJA. PUERTO CABELLO",
      city: "Puerto Cabello",
    },
    {
      name: "Sector Rojas Queipo",
      address:
        "CALLE ROJAS QUEIPO, NRO 102-25, LOCAL NRO 02, CON ANDRES ELOY BLANCO. VALENCIA",
      city: "Valencia",
    },
    {
      name: "Teatro Municipal de Valencia",
      address:
        "CALLE COLOMBIA CON SOUBLETTE, CENTRO COMERCIAL FIERA MOSCA, NIVEL PB., LOCAL 2. VALENCIA",
      city: "Valencia",
    },
    {
      name: "Valencia",
      address:
        "AV. ESTE OESTE CON CALLE 97, URBANIZACION SAN DIEGO, PARQUE COMERCIAL INDUSTRIAL CASTILLITO PARCELA L-70 Y L-78. VALENCIA",
      city: "Valencia",
    },
  ],
  Cojedes: [
    {
      name: "San Carlos",
      address:
        "AV. BOLIVAR CRUCE CON CALLE SILVA, CENTRO COMERCIAL COLAVITA, PLANTA BAJA, LOCALES L1 Y L2. SAN CARLOS",
      city: "San Carlos",
    },
  ],
  "Delta Amacuro": [
    {
      name: "Tucupita Centro",
      address: "CALLE LA PAZ LOCAL NRO S/N SECTOR CENTRO TUCUPITA TUCUPITA",
      city: "Tucupita",
    },
  ],
  "Distrito Capital": [
    {
      name: "Av Francisco Solano",
      address:
        "AV FRANCISCO SOLANO LOPEZ, ENTRE CALLE EL CRISTO Y LOS MANGUITOS EDIF TORRE OASIS PISO PB LOCAL 9, URB LAS DELICIAS CARACAS",
      city: "Caracas",
    },
    {
      name: "Av Fuerzas Armadas",
      address:
        "AV. FUERZAS ARMADAS NORTE, ESQ. SAN JOSE A SAN LUIS, EDF. RESIDENCIA SAN JOSE. CARACAS",
      city: "Caracas",
    },
    {
      name: "Av Lecuna",
      address:
        "AV. LECUNA ESQUINA DE MIRACIELOS AL LADO DE LA ESTACION DEL METRO TEATROS. PARROQUIA SANTA TERESA CARACAS",
      city: "Caracas",
    },
    {
      name: "Av Libertador",
      address:
        "AV. LIBERTADOR CON CALLE NEGRIN, C.C. LIBERTADOR, LOCAL NRO. 13. CARACAS",
      city: "Caracas",
    },
    {
      name: "Av Victoria",
      address:
        "AV. VICTORIA, EDF. MERIDIONAL PB, ENTRE CALLE CUBA Y AV. CENTRO AMÉRICA, DIAGONAL A LA PANADERÍA LA FLOR DEL GRECO. CARACAS",
      city: "Caracas",
    },
    {
      name: "Baruta",
      address:
        "CALLE PAEZ LOCAL NUMERO 4, REFERENCIA DIAGONAL A LA AVENIDA RICAURTE, PUEBLO DE BARUTA CARACAS",
      city: "Caracas",
    },
    {
      name: "Bellas Artes",
      address:
        "AVENIDA ESTE 2 ENTRE SUR 25 Y BOULEVARD AMADOR BENDAYÁN, EDIFICIO MAYA, PB LA CANDELARIA. CARACAS. CARACAS",
      city: "Caracas",
    },
    {
      name: "Bello Monte",
      address:
        "AV. BEETHOVEN, EDIF IBAIZABAL, LOCAL F, COLINAS DE BELLO MONTE. CARACAS",
      city: "Caracas",
    },
    {
      name: "Boleita",
      address:
        "ZONA BOLEITA SUR CALLE SEGUNDA CALLE DE BOLEITA SUR ENTRE SANTA ANA Y AV. PRINCIPAL LOCAL NRO.6. CARACAS",
      city: "Caracas",
    },
    {
      name: "C.C Galerias el Recreo",
      address:
        "AV. VENEZUELA, CENTRO COMERCIAL GALERIAS EL RECREO. NIVEL AVENIDA. LOCAL AV-1C. CARACAS",
      city: "Caracas",
    },
    {
      name: "C.C el Recreo",
      address:
        "AV. CASANOVA CON CALLE EL RECREO CENTRO COMERCIAL EL RECREO NIVEL C1 LOCAL LC1-C29/30, URBANIZACIÓN SABANA GRANDE CARACAS",
      city: "Caracas",
    },
    {
      name: "C.C. Bello Campo",
      address:
        "CENTRO COMERCIAL BELLO CAMPO, ENTRE LA AV. COROMOTO, JOSÉ FELIX SOSA Y LA PRINCIPAL DE LA URB. BELLO CAMPO, LOCALES 27, 28 Y 29 CARACAS",
      city: "Caracas",
    },
    {
      name: "C.C.C.T",
      address:
        "AV LA ESTANCIA ENTRE CALLE BLOHM Y DISTRIBUIDOR CIEMPIÉS C.C CIUDAD TAMANACO NIVEL 1ERA ETAPA LOCAL 43-R2 URB CHUAO CARACAS",
      city: "Caracas",
    },
    {
      name: "Calle Colombia",
      address:
        "CALLE COLOMBIA, ENTRE CRISTO Y MAGALLANES, URB. NUEVA CARACAS- CATIA, EDIFICIO S/N, PISO PB., LOCAL UNICO. CARACAS",
      city: "Caracas",
    },
    {
      name: "Calle Garcilaso",
      address:
        "CALLE GARCILASO EDIF PERSEO PISO PB LOCAL A, URB COLINAS DE BELLO MONTE CARACAS",
      city: "Caracas",
    },
    {
      name: "Cc los Samanes",
      address:
        "AV. 1 CENTRO COMERCIAL LOS SAMANES NIVEL SUPERMERCADO LOCAL 5 URB LOS SAMANES CARACAS",
      city: "Caracas",
    },
    {
      name: "Cdo Catia",
      address:
        "AV.PPAL DE ALTAVISTA, A 50 METROS DE LA TEXTILERIA OVEJITA, GALPON GRUPO ZOOM. CARACAS",
      city: "Caracas",
    },
    {
      name: "Centro",
      address:
        "CALLE NORTE 2 ENTRE ESQUINA DE SANTA CAPILLA A MIJARES EDIF SAN SEBASTIAN PISO PB LOCAL NRO 5 ZONA CATEDRAL CARACAS",
      city: "Caracas",
    },
    {
      name: "Centro Comercial Bello Monte",
      address:
        "AV. PRINCIPAL DE BELLO MONTE, ENTRE AV. LEONARDO DA VINCI Y AV. LINCOLN, C.C. BELLO MONTE, PB, LOCAL NRO. 10. BELLO MONTE, CARACAS",
      city: "Caracas",
    },
    {
      name: "Centro Plaza",
      address:
        "AV FRANCISCO DE MIRANDA CC CENTRO PLAZA NIVEL 4 LOCAL CC4- 25 CARACAS",
      city: "Caracas",
    },
    {
      name: "Chacaito I",
      address:
        "AV. TAMANACO, URBANIZACION EL ROSAL, CENTRO COMERCIAL ARTA, PISO 1, LOCAL 1-3. CARACAS",
      city: "Caracas",
    },
    {
      name: "Chacao, C.A",
      address:
        "CALLE NRO 3 MONSENOR JUAN GRILC REZMAN, QTA. SILVIA NRO 309, LOCAL NRO 5 CHACAO. CARACAS",
      city: "Caracas",
    },
    {
      name: "Coche",
      address:
        "AV INTERCOMUNAL VALLE COCHE C.C COCHE NIVEL PB LOCAL 25 URB DELGADO CHALBAUD DIAGONAL AL SUPERMERCADO SUPREMO. CARACAS",
      city: "Caracas",
    },
    {
      name: "Don Bosco",
      address:
        "AV SAN JUAN BOSCO ENTRE 1 TRANSVERSAL Y AV FCO DE MIRANDA EDIF MAY FLOWER PISO PB LOCAL B CARACAS",
      city: "Caracas",
    },
    {
      name: "El Cementerio",
      address:
        "AV. PPAL DEL CEMENTERIO CALLE EL DEGREDO MERCAPOP PASILLO 6 GRAN MAYOR LOCAL 12, EL CEMENTERIO. CARACAS",
      city: "Caracas",
    },
    {
      name: "El Marques",
      address:
        "AV. SANZ, ENTRE AV. RÓMULO GALLEGOS Y CALLE NAIGUATÁ, C.C. EL MARQUÉS, LOCALES 2 - 3 -9 10 CARACAS",
      city: "Caracas",
    },
    {
      name: "El Valle",
      address:
        "CALLE CAJIGAL CC EL VALLE NIVEL 3 LOCAL M27 URB EL VALLE CARACAS",
      city: "Caracas",
    },
    {
      name: "Forum Ipsfa",
      address:
        "CENTRO COMERCIAL LOS PRóCERES (IPSFA), PASEO LOS ILUSTRES, CARACAS CARACAS",
      city: "Caracas",
    },
    {
      name: "Jardines del Valle",
      address:
        "CALLE ANTIGUA CALLE REAL DE LOS JARDINES DEL VALLE CALLE 14 LOCAL NRO 14 LOCAL, URB EL VALLE TALLER RANI CARACAS",
      city: "Caracas",
    },
    {
      name: "La California",
      address:
        "AV FRANCISCO DE MIRANDA, RESIDENCIAS MÓNACO LOCAL B, URB LA CALIFORNIA NORTE CARACAS",
      city: "Caracas",
    },
    {
      name: "La Candelaria",
      address:
        "AV ESTE 2. TRACABORDO A PUENTE YANEZ, EDIF. RES. YANORAL, P.B. LA CANDELARIA. CARACAS",
      city: "Caracas",
    },
    {
      name: "La Florida",
      address:
        "AV. JUAN BAUTISTA ARISMENDI, ENTRE CALLE PEDROZA Y AV. DON BOSCO. CARACAS",
      city: "Caracas",
    },
    {
      name: "La Hoyada",
      address:
        "AV FUERZAS ARMADAS ENTRE ESQUINAS DE SOCARRAS Y CORAZÓN DE JESUS EDF LA GALERIA PB LOCAL 8, LA HOYADA CARACAS",
      city: "Caracas",
    },
    {
      name: "La Tahona",
      address:
        "AVENIDA LA GUAIRITA, CALLE REYNA, INSTITUTO UNIVERSITARIO AVEPANE, URB. LA TAHONA. CARACAS",
      city: "Caracas",
    },
    {
      name: "La Urbina",
      address:
        "SECTOR SUR, CALLE 7, URB LA URBINA, EDIFICIO GRUPO ZOOM. CARACAS",
      city: "Caracas",
    },
    {
      name: "Las Mercedes",
      address:
        "CALLE VERACRUZ, EDIFICIO TORREON, P.B, LOCAL 4. LAS MERCEDES CARACAS",
      city: "Caracas",
    },
    {
      name: "Las Palmas",
      address: "AV. LAS PALMAS, EDF. PALMA ALTA, TORRE A, LOCAL 4, PB. CARACAS",
      city: "Caracas",
    },
    {
      name: "Los Chaguaramos",
      address:
        "CALLE RAZETTI, URB. LOS CHAGUARAMOS, QUINTA CENTRO PROFESIONAL LOS CHAGUARAMOS PB. CARACAS",
      city: "Caracas",
    },
    {
      name: "Los Cortijos",
      address:
        "AV. FRANCISCO DE MIRANDA EDIFICIO CENTRO EMPRESARIAL DON BOSCO PISO P.B LOCAL 2. LOS CORTIJOS DE LOURDES CARACAS",
      city: "Caracas",
    },
    {
      name: "Los Dos Caminos",
      address:
        "AV SUCRE ENTRE CUARTA Y QUINTA TRANSVERSAL CONJUNTO CENTRO PARQUE BOYACA LOCAL PLANTA BAJA NRO 11, URB LOS DOS CAMINOS CARACAS",
      city: "Caracas",
    },
    {
      name: "Los Naranjos",
      address:
        "AV. EL PAUJI, C.C. GALERIAS LOS NARANJOS, PISO 2, LOCAL C2-53. CARACAS",
      city: "Caracas",
    },
    {
      name: "Los Palos Grandes",
      address:
        "1RA. TRANSVERSAL DE LOS PALOS GRANDES, ENTRE 2DA. Y 3RA. AVENIDA, EDIFICIO GREEN PALACE, PB, LOCAL 4. LOS PALOS GRANDES, CARACAS",
      city: "Caracas",
    },
    {
      name: "Los Ruices",
      address:
        "AV FRANCISCO DE MIRANDA, ENTRE CALLE C Y CALLE GUANCHEZ CC LOS RUICES NIVEL PB LOCAL 11 URB LOS RUICES CARACAS",
      city: "Caracas",
    },
    {
      name: "Makro la Yaguara",
      address:
        "AV. INTERCOMUNAL DE ANTIMANO CRUCE CON AV. PRINCIPAL DE LA YAGUARA. CARACAS",
      city: "Caracas",
    },
    {
      name: "Manzanares",
      address:
        "AV. PRINCIPAL C.C MANZANARES II NIVEL MIRADOR LOCAL M104 CARACAS",
      city: "Caracas",
    },
    {
      name: "Metrocenter Capitolio",
      address:
        "AVENIDA UNIVERSIDAD CON AVENIDA BARALT Y SUR 4, ENTRE LAS ESQUINA LA BOLSA Y PEDRERA. CARACAS",
      city: "Caracas",
    },
    {
      name: "Montalban I",
      address:
        "URB. MONTALBAN I, AV. NRO. 2, AV. MONTALBAN I, C.C. USLAR NIVEL MIRADOR, LOCAL NRO. 03, LA NRO. 21. CARACAS",
      city: "Caracas",
    },
    {
      name: "Montalban Iii",
      address:
        "C.C. CARACAS, PISO 1, LOCAL 01 15 GALERÍAS MAGIC CENTER (MINITIENDAS) MONTALBAN III, AV. TRANSVERSAL 3-E. CARACAS",
      city: "Caracas",
    },
    {
      name: "Multicentro Empresarial del Este",
      address:
        "AV. FRANCISCO DE MIRANDA MULTICENTRO EMPRESARIAL DEL ESTE, PLANTA BAJA TORRE MIRANDA. LOCAL PB 04, AL LADO DEL MESON DE PITA. CARACAS",
      city: "Caracas",
    },
    {
      name: "Parque Caracas-La Candelaria",
      address:
        "AV. ESTE NRO. 2, CON CALLE SUR NRO. 21, C.C. PARQUE CARACAS, NIVEL PB, LOCAL NRO. 36.. CARACAS",
      city: "Caracas",
    },
    {
      name: "Parque Humboldt",
      address:
        "CENTRO COMERCIAL PARQUE HUMBOLDT, LOCAL 10, URB. PRADOS DEL ESTE CARACAS",
      city: "Caracas",
    },
    {
      name: "Pasaje Zingg",
      address:
        "AV UNIVERSIDAD EDIF PASAJE ZINGG PISO PB LOCAL 32 ZONA CENTRO CARACAS",
      city: "Caracas",
    },
    {
      name: "Plaza Madariaga",
      address:
        "AV. LOS SAMANES, C.C. EURO, NIVEL PB, LOCAL NRO. 12. EL PARAISO CARACAS",
      city: "Caracas",
    },
    {
      name: "Plaza las Americas",
      address:
        "AV RAUL LEONI CC PLAZA LAS AMERICAS NIVEL PB LOCAL 2 URB EL CAFETAL CARACAS",
      city: "Caracas",
    },
    {
      name: "Prados del Este",
      address:
        "AV. PPAL. DE PRADOS DEL ESTE. CTRO. COMERCIAL GALERIAS PRADOS DEL ESTE. NIVEL PA. LOCAL 39. CARACAS",
      city: "Caracas",
    },
    {
      name: "Propatria",
      address:
        "AV SIMON BOLIVAR CC PROPATRIA NIVEL 1 LOCAL A9 URB PROPATRIA CARACAS",
      city: "Caracas",
    },
    {
      name: "Quinta Crespo",
      address:
        "AV. BARALT ESQ EL CARMEN C.C. DORAL BARALT NIVEL 1 LOCAL 30. QUINTA CRESPO. CARACAS",
      city: "Caracas",
    },
    {
      name: "Sambil Petare",
      address:
        "AV PRINCIPAL PETARE, C.C SUPER PETARE (SAMBIL PETARE), LOCAL A-18 CARACAS",
      city: "Caracas",
    },
    {
      name: "Sambil la Candelaria",
      address:
        "44 AV. ESTE 0, C.C SAMBIL LA CANDELARIA, LOCAL NO. E-04, NIVEL SÓTANO 1 CARACAS",
      city: "Caracas",
    },
    {
      name: "San Martin",
      address:
        "AV. SAN MARTIN, ENTRE LA 2DA Y 3ERA CALLE LOS MOLINOS, URB. LOS MOLINOS, EDIFICIO KOMPLOT, PB. P.REF. EDIFICIO KOMPLOT, PB. CARACAS",
      city: "Caracas",
    },
    {
      name: "Santa Fe",
      address:
        "AV. JOSE MARIA VARGAS. CTRO COMERCIAL SANTA FE. NIVEL C-3. LOCAL 68, URB SANTA FE NORTE. CARACAS",
      city: "Caracas",
    },
    {
      name: "Santa Rosalia",
      address:
        "ESQ. MUERTO A PELAEZ, CASA NRO. 116, ZONA PARROQUIA SANTA ROSALIA. CARACAS",
      city: "Caracas",
    },
    {
      name: "Telares los Andes",
      address:
        "CENTRO COMERCIAL TELARES LOS ANDES LOCAL NRO 38 SECTOR AZUL CARACAS",
      city: "Caracas",
    },
    {
      name: "Terrazas del Avila",
      address:
        "AV PRINCIPAL TERRAZAS DEL AVILA CC EL AVILA NIVEL C-3 LOCAL LOCAL N C-3-06 URB TERRAZAS DEL AVILAURB TERRAZAS DEL AVILA CARACAS",
      city: "Caracas",
    },
    {
      name: "Torre Exa",
      address: "AV LIBERTADOR CC EXA NIVEL PB LOCAL 17 URB EL ROSAL CARACAS",
      city: "Caracas",
    },
  ],
  Falcón: [
    {
      name: "Av. Manaure",
      address:
        "AV MANAURE CON CALLE EL SOL CC SAN ANTONIO PLAZA P.B LOCAL 08 CORO",
      city: "Coro",
    },
    {
      name: "Calle Argentina",
      address:
        "CENTRO COMERCIAL EMPRESARIAL CADERCO P.B LOCAL A SECTOR CENTRO, CALLE FALCÓN CON ESQUINA CALLE ARGENTINA PUNTO FIJO",
      city: "Punto Fijo",
    },
    {
      name: "Coro",
      address:
        "SECTOR LOS TRES PLATOS, AV. LOS MEDANOS CRUCE CON AV. INDEPENDENCIA, EDIFICIO AREF, PB., LOCAL 1. CORO",
      city: "Coro",
    },
    {
      name: "Dabajuro",
      address: "AV BOLIVAR LOCAL NRO S/N, SECTOR EL CERRO DEBAJURO DABAJURO",
      city: "Dabajuro",
    },
    {
      name: "Ferial Punto Express",
      address:
        "CALLE FALCON CC FERIAL NIVEL PB LOCAL 01, ZONA CENTRO SANTA ANA CORO",
      city: "Coro",
    },
    {
      name: "La Pumarosa",
      address:
        "AV. RAFAEL GONZALEZ, CRUCE CON AV JOFFE PAUL JATEM (ANTIGUA PUMAROSA), EDF. BRISANCA PUNTO FIJO",
      city: "Punto Fijo",
    },
    {
      name: "Las Margaritas",
      address:
        "AV CORO ENTRE AVENIDAS FRANCISCO DE MIRANDA Y MORUY LOCAL CENTRAL SECTOR LAS MARGARITAS PUNTO FIJO",
      city: "Punto Fijo",
    },
    {
      name: "Puerta Maraven",
      address:
        "URB. PUERTA MARAVEN, AV. OLLARVIDES, LOCAL NRO. 264. PUNTO FIJO",
      city: "Punto Fijo",
    },
    {
      name: "Puerto Cumarebo",
      address:
        "CALLE LA PAZ LOCAL COMERCIAL CALLEJA NRO S/N SECTOR CENTRO PUERTO CUMAREBO PUERTO CUMAREBO",
      city: "Puerto Cumarebo",
    },
    {
      name: "Punto Fijo",
      address:
        "SECTOR CENTRO, CALLE ARISMENDI, ENTRE TALAVERA Y LAS PALMAS, LOCAL 203. PUNTO FIJO",
      city: "Punto Fijo",
    },
  ],
  Guárico: [
    {
      name: "Avenida Romulo Gallegos",
      address:
        "AV ROMULO GALLEGOS EDIF ADRIATICO PISO PB LOCAL NRO 03 SECTOR CENTRO VALLE DE LA PASCUA",
      city: "Valle de la Pascua",
    },
    {
      name: "Calabozo",
      address:
        "CALLE 5 ENTRE CARRERAS 9 Y 10, EDIFICIO VILLAVICENCIO, P.B LOCALES 5 Y 6. P.REF. A 50 MTS DEL MUSEO DE CALABOZO. CALABOZO",
      city: "Calabozo",
    },
    {
      name: "El Sombrero",
      address:
        "CALLE FRATERNIDAD CRUCE CON CALLE LOS ESTUDIANTES LOCAL NRO S/N, SECTOR FRENTE A LA PLAZA BOLIVAR EL SOMBRERO EL SOMBRERO",
      city: "El Sombrero",
    },
    {
      name: "Pueblo Nuevo",
      address:
        "SECTOR PUEBLO NUEVO, AV. BOLIVAR CRUCE CON 1RO DE MAYO NRO. 41-D, SAN JUAN DE LOS MORROS",
      city: "San Juan de los Morros",
    },
    {
      name: "San Juan de los Morros",
      address:
        "AVENIDA BOLÍVAR, TORRE TAURO, PLANTA BAJA SAN JUAN DE LOS MORROS",
      city: "San Juan de los Morros",
    },
    {
      name: "Valle de la Pascua",
      address:
        "AVENIDA LAS INDUSTRIAS CRUCE CON CALLE LOS PARAMOS CENTRO COMERCIAL LA PASCUA CENTER LOCAL NRO 2 VALLE DE LA PASCUA",
      city: "Valle de la Pascua",
    },
  ],
  "La Guaira": [
    {
      name: "Caraballeda",
      address:
        "AV. LA COSTANERA CON COPACABANA, C.C. MARGARITA, LOCAL S/N, URB. PALMAR ESTE. CARABALLEDA",
      city: "Caraballeda",
    },
    {
      name: "Carayaca",
      address: "",
      city: "Carayaca",
    },
    {
      name: "Caribe",
      address:
        "URB. CARIBE, CARABALLEDA, AV. BOULEVARD NAIGUATA, EDF. RESIDENCIA GRAN TERRAZA, PISO PB, LOCAL NRO. 1-4. CARABALLEDA",
      city: "Caraballeda",
    },
    {
      name: "Catia la Mar",
      address:
        "AV. ATLANTIDA, CALLES 5 Y 6, QTA. HUCARIMAR, PB, LOCAL 1. CATIA LA MAR",
      city: "Catia la Mar",
    },
    {
      name: "El Consul",
      address:
        "CALLE LOS PIPOTES, ENTRE LA ESQUINA DEL BRILLANTE Y LOS PIPOTES, CASA NRO 129, NIVEL PB. MAIQUETIA",
      city: "Maiquetia",
    },
    {
      name: "Maiquetia",
      address:
        "AV. SOUBLETTE, C.C. LITORAL, NIVEL COMERCIO 1, LOCAL 12. MAIQUETIA",
      city: "Maiquetia",
    },
  ],
  Lara: [
    {
      name: "Aeropuerto Jacinto Lara",
      address:
        "AV. VICENTE LANDAETA GIL CON AV. LA SALLE, AEROPUERTO GENERAL JACINTO LARA P.B, LOCAL A-6 BARQUISIMETO",
      city: "Barquisimeto",
    },
    {
      name: "Avenida Libertador Calle 29",
      address:
        "AV LIBERTADOR ENTRE CALLES 29 Y 30 LOCAL 29-71 EDIF VERGARA BARQUISIMETO",
      city: "Barquisimeto",
    },
    {
      name: "Barquisimeto",
      address:
        "CARRERA 24, ENTRE CALLES 23 Y 24, NRO. 23-69. P.REF. FRENTE A LA PLAZA MORA, DIAGONAL AL IUTIRLA. BARQUISIMETO",
      city: "Barquisimeto",
    },
    {
      name: "C.C Alfa Este",
      address:
        "AV. MADRID, URB. EL PARQUE, C.C. ALFA, NIVEL P/B, LOCAL 6. BARQUISIMETO",
      city: "Barquisimeto",
    },
    {
      name: "C.C Almarriera",
      address:
        "AV. LA MONTANITA C.C.ALMARRIERA PLANTA BAJA ALTA. LOCAL L-29. URB.ALMARRIERA. LOS RASTROJOS.CABUDARE. CABUDARE",
      city: "Cabudare",
    },
    {
      name: "C.C Madetor Este",
      address:
        "AV. VENEZUELA, ENTRE AV. BRACAMONTE Y AV. LOS LEONES, CENTRO COMERCIAL IMECA, PISO 1, LOCAL 1-H Y 1-G BARQUISIMETO",
      city: "Barquisimeto",
    },
    {
      name: "C.C Metropolis Brm",
      address:
        "AV. FLORENCIO JIMENEZ CON AV LA SALLE CC METROPOLI NIVEL SOL LOCAL L-204-205-206 BARQUISIMETO",
      city: "Barquisimeto",
    },
    {
      name: "C.C Parque Real",
      address:
        "AV LARA CON CRUCE AVENIDA LOS LEONES CC PARQUE REAL NIVEL P-AL LOCAL 10, ZONA ESTE BARQUISIMETO",
      city: "Barquisimeto",
    },
    {
      name: "C.C la Estancia",
      address:
        "C.C LA ESTANCIA LOCAL 20 INTERCOMUNAL, BARQUISIMETO- CABUDARE CABUDARE",
      city: "Cabudare",
    },
    {
      name: "Cabudare",
      address:
        "AVENIDA LIBERTADOR ENTRE CALLES MIGUEL BERNAL Y JUAREZ, CENTRO COMERCIAL LIBERTADOR, LOCALES PB-02 Y PB-03. CABUDARE",
      city: "Cabudare",
    },
    {
      name: "Calle 14 Centro-Este",
      address:
        "CALLE 14 ENTRE CARRERAS 18 Y 19 QTA NELLY LOCAL NRO 3 BARQUISIMETO",
      city: "Barquisimeto",
    },
    {
      name: "Carora",
      address:
        "AV FCO DE MIRANDA E/CALLE LISBOS Y COROMOTO LOCAL TIENDAS MONTANA, SECTOR FCO DE MIRANDA CARORA",
      city: "Carora",
    },
    {
      name: "Carrera 15 Calle 46 Oeste",
      address: "CR 15 CON CALLE 46 LOCAL NRO S/N, ZONA CENTRO BARQUISIMETO",
      city: "Barquisimeto",
    },
    {
      name: "Carrera 19 con 34",
      address:
        "CARRERA 19 CON CALLES 33 Y 34 # 33-68, BARQUISIMETO BARQUISIMETO",
      city: "Barquisimeto",
    },
    {
      name: "Carrera 25 Calle 41",
      address: "CARRERA 25, ENTRE CALLE 40 Y 41 NRO 2. BARQUISIMETO",
      city: "Barquisimeto",
    },
    {
      name: "El Cuji",
      address:
        "AV INTERCOMUNAL VIA DUACA KILOMETRO 7 CON AVENIDA BOLIVAR Y CALLE LA CRUZ LOCAL NRO 2, SECTOR EL CUJI BARQUISIMETO",
      city: "Barquisimeto",
    },
    {
      name: "El Tocuyo",
      address:
        "CALLE 20 ENTRE 7 Y 8 CRUCE FINAL AVENIDA FRATERNIDAD URB CORPAHUAICO EL TOCUYO",
      city: "El Tocuyo",
    },
    {
      name: "Lara Palace",
      address:
        "CARRERA 23, ENTRE CALLES 52 Y 54, URBANIZACION SANTA EDUVIGIS, CONJUNTO RESIDENCIAL LARA PALACE, NRO. 1-06, BARQUISIMETO",
      city: "Barquisimeto",
    },
    {
      name: "Las Industrias",
      address:
        "AV. LAS INDUSTRIAS, EDIF. SEDE DE INDUSTRIALES DEL ESTADO LARA, URB. RAFAEL CALDERA BARQUISIMETO",
      city: "Barquisimeto",
    },
    {
      name: "Quibor",
      address: "AV. 5 ENTRE CALLES 12 Y 13, LOCAL NRO S/N. QUIBOR",
      city: "Quibor",
    },
  ],
  Miranda: [
    {
      name: "27 de Febrero",
      address:
        "URB. NRO 27 DE FEBRERO, CTRA NACIONAL, LOCAL ESTACIONAMIENTO Y MULTISERVICIOS SOUTO NRO. S/N. GUARENAS",
      city: "Guarenas",
    },
    {
      name: "C.C Betania",
      address:
        "CTRA NACIONAL CUA-CHARALLAVE CC BETANIA NIVIL P/A LOCAL MINILOCAL NRO 12, SECTOR FRENTE CIUDAD ZAMORA CUA",
      city: "Cua",
    },
    {
      name: "C.C Miranda",
      address:
        "AV. INTERCOMUNAL MENCA DE LEONI, C.C. MIRANDA, LOCAL 30-22. P.REF. AREA DE MINITIENDAS, PARTE ALTA DE GUARENAS. GUARENAS",
      city: "Guarenas",
    },
    {
      name: "C.C la Hoyada",
      address:
        "CALLE PIAR, CC LA HOYADA, NIVEL SEGUNDA PLANTA, LOCAL 328, MUNICIPIO GUAICAIPURO LOS TEQUES",
      city: "Los Teques",
    },
    {
      name: "C.C. Buenaventura Vista Place",
      address:
        "AV. INTERCOMUNAL GUARENAS-GUATIRE, CENTRO COMERCIAL BUENAVENTURA VISTA PLACE NIVEL PLAZA LOCALES PL-94 Y PL-95. GUATIRE",
      city: "Guatire",
    },
    {
      name: "Calle Miranda",
      address:
        "CALLE MIRANDA CON GUAICAIPURO NORTE, MINI CENTRO COMERCIAL ORIENTE, SECTOR 4. LOS TEQUES",
      city: "Los Teques",
    },
    {
      name: "Calle Rivas",
      address: "SECTOR CASCO CENTRAL CALLE RIVAS LOCAL NRO 15 GUATIRE",
      city: "Guatire",
    },
    {
      name: "Calle Sucre",
      address:
        "CALLE SUCRE CON AV. AYACUCHO, LOCAL C. NRO. 3. SANTA TERESA DEL TUY",
      city: "Santa Teresa del Tuy",
    },
    {
      name: "Castillejo",
      address:
        "AV. PRINCIPAL, C.C. CASTILLEJO, NIVEL 1, LOCAL 02-14, URB. CASTILLEJO. GUATIRE",
      city: "Guatire",
    },
    {
      name: "Charallave Ciudad Concordia",
      address:
        "AV. TOSTA GARCIA, CENTRO COMERCIAL CIUDAD CONCORDIA, PISO NRO. 1, LOCALES 8, 9 Y 10. CHARALLAVE",
      city: "Charallave",
    },
    {
      name: "Cua",
      address:
        "CALLE JOSE MARIA CARREÑO LOCAL MINICOZZI NRO PB SECTOR CASCO CENTRAL CUA CUA",
      city: "Cua",
    },
    {
      name: "Galerias las Americas",
      address:
        "CARRETERA PANAMERICANA, KM 15, SECTOR LAS MINAS, CC GALERÍA LAS AMÉRICAS, NIVEL 1, LOCAL N1-40 SAN ANTONIO DE LOS ALTOS",
      city: "San Antonio de los Altos",
    },
    {
      name: "Guarenas",
      address:
        "ZONA INDUSTRIAL SANTA CRUZ, URB. LOS NARANJOS, P.REF. PASANDO LOS BOMBEROS ENTRANDO POR LA LEVIS AL LADO DE PANDOK. GUARENAS",
      city: "Guarenas",
    },
    {
      name: "Higuerote",
      address:
        "SECTOR TOCORON HIGUEROTE, AV. ANDRES BELLO ELOY BLANCO, C.C. ANJULICAR NIVEL PB, LOCAL NRO. 3. HIGUEROTE",
      city: "Higuerote",
    },
    {
      name: "La Cascada",
      address:
        "CARRETERA PANAMERICANA, KM. 21, C.C. LA CASCADA, NIVEL PB, LOCAL 43, CORRALITO. CARRIZAL",
      city: "Carrizal",
    },
    {
      name: "Los Teques",
      address:
        "SECTOR EL TAMBOR, AV. PEDRO RUFFO FERRER, C.C. LOS TEQUES LOCAL A5. P.REF. FRENTE AL BANCO DE VENEZUELA. LOS TEQUES",
      city: "Los Teques",
    },
    {
      name: "Ocumare del Tuy",
      address:
        "CALLE PRINCIPAL LA ACEQUIA CC RESIDENCIA LA ACEQUIA NIVEL PB LOCAL NRO 7 OCUMARE DEL TUY",
      city: "Ocumare del Tuy",
    },
    {
      name: "San Antonio",
      address:
        "CARRETERA PANAMERICANA KM 16 BAJANDO POR EL DISTRIBUIDOR DE LA ROSALEDA (SENTIDO CARACAS) A MANO DERECHA 100 MTS ANTES DEL C.C. LA CASONA I, LOCAL ZOOM. SAN ANTONIO DE LOS ALTOS",
      city: "San Antonio de los Altos",
    },
  ],
  Monagas: [
    {
      name: "Av Raul Leoni",
      address:
        "AV. RAUL LEONI CRUCE CON PROLONGACION BOYACA, EDF. NAR- OLY, TORRE A, P. PB, LOCAL A SUR, SECTOR CENTRO. MATURIN",
      city: "Maturin",
    },
    {
      name: "Casco Central I",
      address:
        "AV AZCUE CON AV ROJAS SECTOR CENTRO, LOCAL NRO 01, A DOS CUADRAS DE LA AV.BOLIVAR MATURIN",
      city: "Maturin",
    },
    {
      name: "Elarba I",
      address:
        "AVENIDA BOLIVAR, EDIFICIO ELARBA, PISO PB, LOCAL 133, SECTOR CENTRO DE MATURIN MATURIN",
      city: "Maturin",
    },
    {
      name: "Los Samanes Maturin",
      address:
        "CALLE PRINCIPAL, CENTRO COMERCIAL LOS SAMANES, LOCAL 1, PLANTA BAJA, SECTOR LOS SAMANES. MATURIN",
      city: "Maturin",
    },
    {
      name: "Maturin",
      address:
        "AV. BICENTENARIO EDIFICIO CONGESA, LOCAL I Y II PUNTO DE REFERENCIA: FRENTE PLAZA EL INDIO MATURIN",
      city: "Maturin",
    },
    {
      name: "Punta de Mata",
      address:
        "AV BOLIVAR CC JUPITER CENTER NIVEL PB LOCAL 10, SECTOR CENTRO PUNTA DE MATA PUNTA DE MATA",
      city: "Punta de Mata",
    },
    {
      name: "Temblador",
      address: "CALLE SUCRE CASA NRO S/N SECTOR LA PLAZA TEMBLADOR TEMBLADOR",
      city: "Temblador",
    },
    {
      name: "Tipuro",
      address:
        "CTRA. VÍA VIBORAL, CC VIRGEN DEL VALLE, NIVEL PLANTA ALTA, LOCAL 58-A, SECTOR TIPURO MATURIN",
      city: "Maturin",
    },
    {
      name: "Ugarte Pelayo",
      address:
        "AV. ALIRIO UGARTE PELAYO, EDIFICIO VESPA, LOCAL 6, SECTOR BAJO GUARAPICHE. MATURIN",
      city: "Maturin",
    },
  ],
  Mérida: [
    {
      name: "Av Miranda",
      address: "AV. MIRANDA, CENTRO COMERCIAL DOÑA HERACLITA LOCAL 2. MERIDA",
      city: "Merida",
    },
    {
      name: "Av Urdaneta",
      address:
        "AV. URDANETA, C.C. LAS MARGARITAS, NIVEL PB, LOCAL PB-9, SECTOR URDANETA. MERIDA",
      city: "Merida",
    },
    {
      name: "Centro Ejido",
      address:
        "CALLE SUCRE FRENTE A LA PLAZA BOLIVAR DE EJIDO CON AV BOLIVAR C.C EJIDO PB LOCAL 1-C EJIDO",
      city: "Ejido",
    },
    {
      name: "Centro Merida",
      address:
        "AV 3 INDEPENDENCIA ESQUINA CALLE 21 LASO CC LA ROSALERA NIVEL 03 OF 01 SECTOR CENTRO MERIDA MERIDA",
      city: "Merida",
    },
    {
      name: "Centro Vigia",
      address:
        "CALLE 3 AL LADO DE LA PANADERÍA GIORDANO, PARROQUIA PRESIDENTE BETANCOURT, SECTOR CENTRO MÉRIDA EL VIGIA",
      city: "El Vigia",
    },
    {
      name: "Ejido Mall",
      address:
        "CALLE EL COBRE MUNICIPIO CAMPO ELÍAS, PARROQUIA MATRIZ, LOCAL PB-B-17/PB-B-18, CENTRO COMERCIAL EJIDO MALL, SECTOR POZO HONDO. EJIDO",
      city: "Ejido",
    },
    {
      name: "El Vigia",
      address:
        "AV. 3 NRO 3-88, BARRIO PANAMERICANO, ENTRE AV. BOLIVAR Y DON PEPE ROJAS, P.REF. DIAGONAL AL DISTRIBUIDOR CARRERO MENDEZ. EL VIGIA",
      city: "El Vigia",
    },
    {
      name: "La Parroquia",
      address: "CALLE PÁEZ CASA NRO 2-35 LOCAL A, SECTOR LA PARROQUIA MERIDA",
      city: "Merida",
    },
    {
      name: "Lagunillas",
      address:
        "AV 6, AGUA DE URAO LOCAL NRO S/N SECTOR PUEBLO VIEJO LAGUNILLAS",
      city: "Lagunillas",
    },
    {
      name: "Los Proceres",
      address:
        "AV LOS PRÓCERES EDIF LONGIMAR PISO PB LOCAL 2 Y 3, SECTOR ALDEA SANTA BARBARA MERIDA",
      city: "Merida",
    },
    {
      name: "Mercado Murachi",
      address:
        "AV.LAS AMERICAS, CENTRO COMERCIAL MERCADO MURACHI, NIVEL UNICO LOCAL 44. MERIDA",
      city: "Merida",
    },
    {
      name: "Merida",
      address:
        "CALLE 36 ENTRE AVENIDAS 2 Y 3, EDIFICIO EL PARQUE PISO PB LOCAL 35-65, SECTOR CENTRO EL LLANO MERIDA",
      city: "Merida",
    },
    {
      name: "Mucuchies",
      address:
        "AV INDEPENDENCIA ESQUINA CALLE SUCRE NRO 69, CENTRO MUCUCHIES MUCUCHIES",
      city: "Mucuchies",
    },
    {
      name: "Santa Elena de Arenales",
      address:
        "CARRETERA PANAMERICANA FRENTE AL COMANDO DE LA POLICIA ETADAL CASA S/N PISO 2 LOCAL NRO 2, SANTA ELENA DE ARENALES SANTA ELENA DE ARENALES (EDO. MERIDA)",
      city: "Santa Elena de Arenales",
    },
    {
      name: "Tovar",
      address: "AV CRISTOBAL MENDOZA EDIF ECHEVERRIA PISO 1 LOCAL 3 Y 4 TOVAR",
      city: "Tovar",
    },
  ],
  "Nueva Esparta": [
    {
      name: "C.C Mercado la Isla",
      address:
        "AV LLANO ADENTRO CC MERCADO LA ISLA NIVEL 01 LOCAL L- 336, SECTOR LLANO ADENTRO PORLAMAR",
      city: "Porlamar",
    },
    {
      name: "C.C la Redoma",
      address:
        "CALLE LIBERTAD CC LA REDOMA NIVEL 1 LOCAL 42 SECTOR LOS ROBLES EL PILAR PAMPATAR",
      city: "Pampatar",
    },
    {
      name: "Calle Campos",
      address: "CALLE CAMPOS EDIFICIO JUAMO PB PORLAMAR",
      city: "Porlamar",
    },
    {
      name: "Juan Griego",
      address: "C.C. LA ESTANCIA, LOCAL L23, JUAN GRIEGO. JUAN GRIEGO",
      city: "Juan Griego",
    },
    {
      name: "Los Robles",
      address:
        "AV JOVITO VILLALBA C.C. CENTRO ARTESANAL LOS ROBLES NIVEL P.B PAMPATAR",
      city: "Pampatar",
    },
    {
      name: "Porlamar",
      address:
        "AV. 4 DE MAYO, RESIDENCIAS PANERCO, PLANTA BAJA, LOCAL 1. PORLAMAR",
      city: "Porlamar",
    },
    {
      name: "Porlamar Centro",
      address:
        "CALLE VELÁSQUEZ CON CALLE DÍAZ, CENTRO COMERCIAL CONCORD, LOCAL #100. PASILLO CENTRAL PORLAMAR",
      city: "Porlamar",
    },
    {
      name: "Rattan Plaza",
      address:
        "AV JOVITO VILLALBA CC RATTAN HYPERPLAZA NIVEL MEZZANINA LOCAL E-43, SECTOR PLAYA EL ANGEL PAMPATAR",
      city: "Pampatar",
    },
    {
      name: "Sambil Margarita",
      address:
        "AVENIDA JÓVITO VILLALBA, SECTOR SAN LORENZO, SAMBIL MARGARITA, LOCALES T01A Y T01B, AL LADO DE LA SALIDA PLAYA GUACUCO PAMPATAR",
      city: "Pampatar",
    },
  ],
  Portuguesa: [
    {
      name: "Acarigua",
      address:
        "CALLE 30 CON AV. 35, CENTRO COMERCIAL PÁEZ, PLANTA BAJA, LOCAL 02. ACARIGUA",
      city: "Acarigua",
    },
    {
      name: "C.C. Sol de Curpa",
      address:
        "AV. LIBERTADOR, E/ CALLES 32 Y 33 C.C. SOL DE CURPA NIVEL PB., LOCAL 7 ACARIGUA",
      city: "Acarigua",
    },
    {
      name: "Corredor Vial Tomas Montilla",
      address:
        "CR 7 ENTRE AV UNDA Y CORREDOR VIAL TOMAS MONTILLA EDIF FORUM PISO 1 LOCAL 2, BARRIO MATURIN GUANARE",
      city: "Guanare",
    },
    {
      name: "Guanare",
      address:
        "AV. SIMON BOLIVAR ENTRE AV. UNDA Y CALLE 9, CENTRO COMERCIAL AUTOCENTRO, PB. LOCAL ZOOM. GUANARE",
      city: "Guanare",
    },
    {
      name: "Turen",
      address:
        "AV. RICARDO PEREZ ZAMBRANO, EDIF. AGOSI. LOCAL NRO. 1. VILLA BRUZUAL TUREN",
      city: "Turen",
    },
  ],
  Sucre: [
    {
      name: "Av.Cancamure",
      address: "AV CANCAMURE, URB SUCRE LOCAL C CUMANA",
      city: "Cumana",
    },
    {
      name: "C.C Marina Plaza",
      address:
        "AV.CRISTOBAL COLON PERIMETAL, SEC. EL DIQUI, C.C. MARINA PLAZA, EDIF. D-3, LOCAL P.B.-4 CUMANA",
      city: "Cumana",
    },
    {
      name: "C.C San Onofre",
      address:
        "AV HUMBOLDT CC SAN ONOFRE NIVEL PB LOCAL NRO 13, SECTOR SANTA CATALINA CUMANA",
      city: "Cumana",
    },
    {
      name: "Carupano",
      address:
        "AV.LIBERTAD CON CALLE MONAGAS, EDIFICIO TURBO ORIENTE PB CARUPANO",
      city: "Carupano",
    },
    {
      name: "Carupano Centro",
      address:
        "CALLE JUNCAL, CRUCE CON CALLE BOLIVAR, LOCAL NRO 258, SECTOR CENTRO CARUPANO",
      city: "Carupano",
    },
    {
      name: "Casco Historico",
      address:
        "CALLE SUCRE C.C CUMANA NIVEL ÚNICO OFICINA 8, SECTOR CASCO HISTORICO. CUMANA",
      city: "Cumana",
    },
    {
      name: "Costo Supermercado",
      address:
        "AV ARISTIDES ROJAS CON CALLE BERMUDEZ CC PERMAGAS NIVEL PLANTA BAJA LOCAL I CUMANA",
      city: "Cumana",
    },
    {
      name: "Cumana",
      address:
        "AV SANTA ROSA, EDIFICIO GRUPO PROFESIONAL SANTA ROSA PB LOCAL 2 CUMANA ESTADO SUCRE CUMANA",
      city: "Cumana",
    },
    {
      name: "Parada Bolivariano",
      address:
        "CALLE MARIÑO CC JUNIOR NIVEL PB LOCAL 1, SECTOR BOULEVARD URDANETA CUMANA",
      city: "Cumana",
    },
    {
      name: "Santa Rosa",
      address:
        "SECTOR SANTA ROSA, AV. SANTA ROSA, C.C. SANTA ROSA, NIVEL PB., LOCAL 06, CUMANA",
      city: "Cumana",
    },
  ],
  Trujillo: [
    {
      name: "Bocono",
      address:
        "SECTOR CENTRO, AV. CARABOBO ENTRE CALLE MONSENOR JAUREGUI Y ANDRES BELLO, CASA NRO. 6-22. BOCONO",
      city: "Bocono",
    },
    {
      name: "La Pastora",
      address:
        "CALLE PRINCIPAL LOCAL NRO 02 SECTOR EL CENTRO, LA PASTORA LA PASTORA",
      city: "La Pastora",
    },
    {
      name: "Trujillo",
      address:
        "AV BOLIVAR CENTRO COMERCIAL SOLUNTO, NIVEL 1 LOCAL 1, CENTRO DE TRUJILLO TRUJILLO",
      city: "Trujillo",
    },
    {
      name: "Valera",
      address:
        "AVENIDA BOLÍVAR EDIFICIO GALOTTA II, URB LAS ACACIAS AL LADO DE LA BERA VALERA",
      city: "Valera",
    },
    {
      name: "Valera Centro",
      address:
        "CALLE 6, ENTRE AVENIDAS 10 Y 11 CC CANAIMA NIVEL P/B LOCAL L- 20 VALERA",
      city: "Valera",
    },
  ],
  Táchira: [
    {
      name: "5ta Avenida I",
      address:
        "AV 5TA ENTRE CALLES 3 Y 4 LOCAL EDIFICIO A.C NRO 8, SECTOR CENTRO SAN CRISTOBAL",
      city: "San Cristobal",
    },
    {
      name: "Av Ferrero Tamayo",
      address:
        "AV. FERRERO TAMAYO, CRUCE AV. LAS PILAS CENTRO COMERCIAL BARATA, LOCAL P.B-03. SAN CRISTOBAL",
      city: "San Cristobal",
    },
    {
      name: "Av Rotaria",
      address:
        "VDA 8 Y 9 CASA NRO 2-24 SECTOR PROLONGACION DE LA UNIDAD VECINAL SAN CRISTOBAL",
      city: "San Cristobal",
    },
    {
      name: "Av Venezuela",
      address:
        "AV VENEZUELA CARRERA 6 LOCAL NRO 6-02, SECTOR BOLIVAR SAN ANTONIO DEL TACHIRA",
      city: "San Antonio del Tachira",
    },
    {
      name: "Barrio el Carmen",
      address: "CALLE 2 NRO 10-45 BARRIO EL CARMEN LA CONCORDIA SAN CRISTOBAL",
      city: "San Cristobal",
    },
    {
      name: "Calle 12",
      address:
        "CALLE 12, ENTRE CARRERA 4 Y 5TA AVENIDA NRO 4-35 LA ERMITA ( TAPON LACOR) SAN CRISTOBAL SAN CRISTOBAL",
      city: "San Cristobal",
    },
    {
      name: "Calle 15",
      address:
        "CALLE 15 CON CARRERA 22, EDIF. APOLO, LOCAL 3, BARRIO OBRERO. SAN CRISTOBAL",
      city: "San Cristobal",
    },
    {
      name: "Capacho",
      address:
        "CARRERA 5, ENTRE CALLE 9 Y 10 C.C CAPIN TIENDAS, LOCAL NRO 12, BARRIO CENTRO, CAPACHO CAPACHO",
      city: "Capacho",
    },
    {
      name: "Carrera 19",
      address:
        "CR 19 ENTRE CALLE 15 Y 16 LOCAL NRO 15-15, BARRIO OBRERO SAN CRISTOBAL",
      city: "San Cristobal",
    },
    {
      name: "Cdo Svz",
      address:
        "CALLE 14 CON CALLEJUELA LA REPUBLICA, NRO G-46. SECTOR PUENTE REAL SAN CRISTOBAL",
      city: "San Cristobal",
    },
    {
      name: "Colon",
      address:
        "SECTOR CENTRO COLON TACHIRA, CTRA NRO. 7, CON CALLE NRO. 3, CASA NRO. 6-81. COLON",
      city: "Colon",
    },
    {
      name: "Coloncito",
      address:
        "SECTOR CASCO CENTRAL COLONCITO, CR. NRO. 04, CASA NRO. 3- 47. COLONCITO",
      city: "Coloncito",
    },
    {
      name: "El Piñal",
      address:
        "SECTOR EL PIÑAL, CALLE N°. 1 ENTRE CARRERA N°. 3 Y 4, CASA N°. 3-19. (SAN RAFAEL DEL PIñAL). EL PINAL",
      city: "El Pinal",
    },
    {
      name: "La Concordia",
      address:
        "AV 19 DE ABRIL NRO 9-29 ENTRE CARRERAS 9 Y 10 LA CONCORDIA. SAN CRISTOBAL",
      city: "San Cristobal",
    },
    {
      name: "La Fria",
      address:
        "SECTOR TERMINAL DE PASAJEROS LA FRIA, CALLE 2 ENTRE CARRERAS 18 Y 19, LOCAL NRO. 25 LA FRIA",
      city: "La Fria",
    },
    {
      name: "La Grita C.A",
      address:
        "CALLE 2 ENTRE CARRERAS 11 Y 12 CASA 11-86 SECTOR CASCO CENTRAL LA GRITA",
      city: "La Grita",
    },
    {
      name: "Multiservicios Barrio Obrero",
      address:
        "CALLE 11 ENTRE CARRERAS 18 Y 19 NRO 19-59, CALLE 11 ENTRE CARRERAS 18 Y 19 NRO 19-59. SAN CRISTOBAL",
      city: "San Cristobal",
    },
    {
      name: "Palmira",
      address: "SECTOR PALMIRA, CARRETERA 5, LOCAL NRO. 2. PALMIRA",
      city: "Palmira",
    },
    {
      name: "Paramillo",
      address:
        "AV 4 EDIF MINICENTRO PARAMILLO PISO 3 LOCAL 1 ETAPA, ZONA INDUSTRIAL PARAMILLO SAN CRISTOBAL",
      city: "San Cristobal",
    },
    {
      name: "Rubio",
      address:
        "CALLE 14 ENTRE AV. 8 Y 9, CENTRO COMERCIAL DONA IVONNE, P.B. LOCAL 6 Y 7 RUBIO",
      city: "Rubio",
    },
    {
      name: "San Antonio",
      address:
        "CALLE 9 ENTRE CARRERAS 10 Y 11 NúMERO 10-44 BARRIO LA POPA SAN ANTONIO DEL TáCHIRA. SAN ANTONIO DEL TACHIRA",
      city: "San Antonio del Tachira",
    },
    {
      name: "San Cristobal",
      address:
        "AV. LIBERTADOR, EDIFICIO EL MARACUCHO PB. LOCAL A-56. P.REF. FRENTE AL HOTEL HAMBURGO. SAN CRISTOBAL",
      city: "San Cristobal",
    },
    {
      name: "Santa Teresa",
      address:
        "CALLE PRINCIPAL CC CASA GRANDE NIVEL PLANTA BAJA LOCAL S/N, SECTOR SANTA TERESA SAN CRISTOBAL",
      city: "San Cristobal",
    },
    {
      name: "Tariba",
      address:
        "CALLE 6 CON CARRERA 6 CASA NRO 5-70, SECTOR TARIBA TARIBA NUEVA",
      city: "Tariba Nueva",
    },
    {
      name: "Ureña",
      address: "CALLE 5, BARRIO LA GOAJIRA, CARRETERA 5, LOCAL 01. URENA",
      city: "Urena",
    },
  ],
  Yaracuy: [
    {
      name: "Av 6 C.C Don Antonio",
      address:
        "AV 6 ENTRE CALLE 16 Y AVENIDA LA PATRIA C.C DON ANTONIO NIVEL P.B LOCAL 5, SECTOR CENTRO SAN FELIPE",
      city: "San Felipe",
    },
    {
      name: "San Felipe",
      address:
        "AV. LA PATRIA CON AV. 19 DE ABRIL, CENTRO COMERCIAL ARACOI, LOCAL C-5. P.REF. FTE. A OFICINAS DE CALEY. SAN FELIPE",
      city: "San Felipe",
    },
    {
      name: "Yaritagua",
      address: "AV. PADRE TORRES. CALLE 19 ENTRE CARRETERA 11 Y 12. YARITAGUA",
      city: "Yaritagua",
    },
  ],
  Zulia: [
    {
      name: "3y San Martin",
      address:
        "SECTOR BELLA VISTA, CALLE NRO. 74, CON AV. NRO. 3Y, LOCAL CANDELORO NRO. 5-A. MARACAIBO",
      city: "Maracaibo",
    },
    {
      name: "Amparo",
      address:
        "AV 58 C.C CIRCUNVALACION NIVEL PB LOCAL 9, SECTOR AMPARO MARACAIBO",
      city: "Maracaibo",
    },
    {
      name: "Av 10 Cecilio Acosta",
      address: "AV 10 ENTRE CALLES 66 Y 66A CASA NRO 66-48 LOCAL 2 MARACAIBO",
      city: "Maracaibo",
    },
    {
      name: "Av Libertador Centro",
      address:
        "AV 100 CC SAN ANDRESITO NIVEL PB LOCAL 8-54, SECTOR CASCO CENTRAL MARACAIBO",
      city: "Maracaibo",
    },
    {
      name: "Av. 4 Bella Vista",
      address: "CALLE 63A ENTRE AVS 4 Y 5 CASA 4-20 NRO 2 Y 3 MARACAIBO",
      city: "Maracaibo",
    },
    {
      name: "Av. Alonso de Ojeda",
      address:
        "AV. ALONSO DE OJEDA, EDIF. TIBIDABO, P.B. LOCAL 2, SEC. CASCO CENTRAL, CIUDAD OJEDA CIUDAD OJEDA",
      city: "Ciudad Ojeda",
    },
    {
      name: "Av. la Limpia",
      address: "AV 28 LA LIMPIA CON AV 78. MARACAIBO",
      city: "Maracaibo",
    },
    {
      name: "Bachaquero",
      address:
        "AV BOLIVAR CC BOLIVAR CENTER NIVEL 2 LOCAL 2, SECTOR EL MURO BACHAQUERO",
      city: "Bachaquero",
    },
    {
      name: "Boulevard la Coromoto",
      address: "CALLE 171 LOCAL NRO 44-73 SECTOR LA COROMOTO MARACAIBO",
      city: "Maracaibo",
    },
    {
      name: "C.C Akrai Center",
      address:
        "CALLE 86 PICHINCHA CON AV 4 BELLA VISTA, CENTRO COMERCIAL AKRAI CENTER, LOCALES A-14 Y A-15 PB MARACAIBO",
      city: "Maracaibo",
    },
    {
      name: "C.C Galerias Mall",
      address:
        "C.C GALERIAS MALL, NIVEL P.B. LOCAL PB-ESTE 4A, SECTOR FRANCISCO DE MIRANDA, FRENTE A LA CLÍNICA LOS OLIVOS, CALLE 28 MARACAIBO",
      city: "Maracaibo",
    },
    {
      name: "C.C el Saman",
      address:
        "CTRA KM 11 VIA PERIJA CC EL SAMAN NIVEL PB LOCAL S/N URB EL CAUJARO MARACAIBO",
      city: "Maracaibo",
    },
    {
      name: "C.C. Gran Bazar",
      address:
        "AV 15 C.C GRAN BAZAR PRIMER PISO LOCAL ML 1480 SECTOR SANTA BÁRBARA MARACAIBO",
      city: "Maracaibo",
    },
    {
      name: "C.C. Metrosol",
      address:
        "AV 58 CC METROSOL NIVEL PB LOCAL 19-A SECTOR CIRCUNVALACION NRO 2 MARACAIBO MARACAIBO",
      city: "Maracaibo",
    },
    {
      name: "Cabimas",
      address: "CARRETERA H CENTRO COMERCIAL BORJAS LOCAL 6 Y 7 CABIMAS",
      city: "Cabimas",
    },
    {
      name: "Caja Seca",
      address:
        "AV PRIMERA TRANSVERSAL DEL CORREDOR VIAL AL TERMINAL DE PASAJEROS, CC FARMACIA SUR DEL LAGO NIVEL PB LOCAL 2, SECTOR CASCO CENTRAL CAJA SECA CAJA SECA",
      city: "Caja Seca",
    },
    {
      name: "Calle 72",
      address:
        "AV 9 CALLE 72 LOCAL NRO 01 SECTOR AVENIDA 72 FRENTE AL EDIFICIO HAMDELLA MARACAIBO",
      city: "Maracaibo",
    },
    {
      name: "Calle Vargas",
      address:
        "CALLE VARGAS CON CALLE CAMPO ELIAS CC NOCCIANO NIVEL PB LOCAL 2 SECTOR CASCO CENTRAL, CIUDAD OJEDA CIUDAD OJEDA",
      city: "Ciudad Ojeda",
    },
    {
      name: "Centro Norte Fuerzas Armadas",
      address:
        "AV 15 Y 15 A ENTRE CALLES 19 A Y 20 CC NORTE NIVEL PB LOCAL PB- 17, SECTOR FUERZAS ARMADAS MARACAIBO",
      city: "Maracaibo",
    },
    {
      name: "Ciudad Ojeda",
      address:
        "SECTOR LAS MOROCHAS, AV. INTERCOMUNAL CALLE CARDON, EDIFICIO OJEDA. PB., LOCALES 6 Y 7. CIUDAD OJEDA",
      city: "Ciudad Ojeda",
    },
    {
      name: "Ciudadela Faria",
      address:
        "AV 27 CIRCUNVALACION 2 CON CALLE 69 CC CIUDADELA PLAZA NIVEL 2DO LOCAL 13-1, URB CIUDADELA FARIA MARACAIBO",
      city: "Maracaibo",
    },
    {
      name: "Delicias",
      address:
        "AV 15 PROLONGACION DELICIAS CC LUZ Y SOL NO 60C.58 NIVEL NO INDICA LOCAL 3 MARACAIBO",
      city: "Maracaibo",
    },
    {
      name: "Edificio D Maio",
      address:
        "AVENIDA INTERCOMUNAL EDIFICIO HOTEL D MAIO NIVEL PLANTA BAJA, LOCAL NRO 1 SECTOR EL DIVIDIVE CABIMAS",
      city: "Cabimas",
    },
    {
      name: "El Venado",
      address:
        "CENTRO COMERCIAL DE DOS PLANTAS VERA CRUZ CARRETERA LARA -ZULIA LOCAL S/N P.B. PASILLO PRINCIPAL NO. 06, SECTOR CASCO CENTRAL EL VENADO",
      city: "El Venado",
    },
    {
      name: "Kilometro 4",
      address:
        "CALLE 148 LOCAL NO. 115-59 EDIFICIO TAMI VIA ZONA INDUSTRIAL A 50 METROS DEL KILÓMETRO 4. MARACAIBO",
      city: "Maracaibo",
    },
    {
      name: "La Arterial Ciudad Ojeda",
      address:
        "CTRA K CON ESQUINA AVENIDA CRISTÓBAL COLON CC RIJER NIVEL PB LOCAL LOCAL NRO 7, SECTOR ARTERIAL 7 CIUDAD OJEDA",
      city: "Ciudad Ojeda",
    },
    {
      name: "La Chinita",
      address:
        "AV. 15, ENTRE CALLES 93 Y 95, CENTRO COMERCIAL LA CHINITA, PRIMER NIVEL, LOCAL N° 26. P.REF. POR LA FERIA DE COMIDA. MARACAIBO",
      city: "Maracaibo",
    },
    {
      name: "La Concepcion",
      address:
        "SECTOR LOS LIRIOS LA CONCEPCION, (LOS TEQUES), AV. PRINCIPAL, LOCAL NRO. S/N. LA CONCEPCION",
      city: "La Concepcion",
    },
    {
      name: "La Villa del Rosario",
      address:
        "SECTOR CASCO CENTRAL LA VILLA DEL ROSARIO, AV. N°. 18 DE OCTUBRE, LOCAL N°. 18-13. VILLA DEL ROSARIO",
      city: "Villa del Rosario",
    },
    {
      name: "Los Puertos de Altagracia",
      address:
        "AV 3 NUMERO 10-98, ESQUINA 11 CC LAS AURORAS NIVEL P.B LOCAL N° 9 LOS PUERTOS DE ALTAGRACIA",
      city: "Los Puertos de Altagracia",
    },
    {
      name: "Machiques",
      address:
        "AV ARTES ENTRE CALLE LA MARINA Y CALLE EL CARMEN CASA NRO S/N, MACHIQUES MACHIQUES",
      city: "Machiques",
    },
    {
      name: "Maracaibo",
      address: "AVENIDA 5 DE JULIO, CALLE 77 CON AV. 12. MARACAIBO",
      city: "Maracaibo",
    },
    {
      name: "Mene Grande",
      address: "MENE GRANDE - LA LINEA MENE GRANDE",
      city: "Mene Grande",
    },
    {
      name: "Plaza de Toros",
      address:
        "CALLE 52-A LOCAL NRO 1380000 URB LA TRINIDAD SECTOR PLAZA DE TORO. MARACAIBO",
      city: "Maracaibo",
    },
    {
      name: "Pomona",
      address:
        "BARRIO SAN TRINO LA POMONA, CALLE NRO. 102 ENTRE AV. NRO. 18 Y CALLE NRO. 102A, LOCAL NRO. 18-26. MARACAIBO",
      city: "Maracaibo",
    },
    {
      name: "Santa Barbara del Zulia",
      address:
        "AV BOLIVAR CC DORADO NIVEL P/B LOCAL 02 SANTA BARBARA DEL ZULIA",
      city: "Santa Barbara del Zulia",
    },
    {
      name: "Santa Rita",
      address:
        "AV 8 ENTRE CALLLES 66A Y 67 EDIF EL GLOBO PISO PB LOCAL 3, SECTOR SANTA RITA MARACAIBO",
      city: "Maracaibo",
    },
    {
      name: "Sierra Maestra",
      address:
        "CALLE 13 CC OASIS NIVEL PB LOCAL L-3 BARRIO SIERRA MAESTRA SIERRA MAESTRA MARACAIBO",
      city: "Maracaibo",
    },
  ],
};
