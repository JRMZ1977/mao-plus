// MAO Plus — versión de la aplicación (fuente ÚNICA en el renderer).
//
// Se sella en todo lo que produce un resultado: metadato del proyecto (`versionMAO`),
// columna `mao_version` del CSV y portada de los PDF. Con cambios en la matemática del
// motor, un número sin la versión que lo calculó no es trazable. Antes vivía escrita a
// mano en seis sitios. `python/tests/test_version_unica.py` la fija contra package.json.
window.MAO_VERSION = '1.3.1';
