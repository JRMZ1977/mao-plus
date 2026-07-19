-- MAO Plus — lanzador de desarrollo
-- Arranca Electron contra la copia de trabajo del repositorio.
-- El proyecto se movio fuera de iCloud el 2026-07-19; si vuelve a moverse,
-- basta con actualizar repoPath y recompilar este applet.
--
-- Fuente del applet /Applications/MAO_e.app (anclado al Dock como "MAO Plus (dev)").
-- Es un lanzador de DESARROLLO: corre el codigo del repo, no un build empaquetado.
-- Para un bundle autonomo se usa `npm run package` (necesita runtime/ regenerado
-- con scripts/build-runtime.sh, o el backend Python no arranca al empaquetar).
--
-- Recompilar tras editar este fichero:
--   osacompile -o /Applications/MAO_e.app/Contents/Resources/Scripts/main.scpt \
--              scripts/mao-dev-launcher.applescript
--
-- Regenerar el icono desde icon.png (800x800):
--   sips -z <n> <n> icon.png --out MAO.iconset/icon_<n>x<n>.png   (los 10 tamanos)
--   iconutil -c icns MAO.iconset -o MAO.icns
--   cp MAO.icns /Applications/MAO_e.app/Contents/Resources/applet.icns && touch /Applications/MAO_e.app

property repoPath : "/Users/juanramirez/Developer/mao-plus"
property logPath : "/tmp/mao_launch.log"

on existe(p)
	try
		do shell script "test -e " & quoted form of p
		return true
	on error
		return false
	end try
end existe

on avisar(titulo, detalle)
	display dialog titulo & return & return & detalle buttons {"OK"} default button "OK" with icon caution with title "MAO Plus"
end avisar

on run
	if not existe(repoPath) then
		avisar("No encuentro el proyecto MAO Plus.", "Esperaba encontrarlo en:" & return & repoPath & return & return & "Si moviste el repositorio, hay que actualizar la ruta de este lanzador.")
		return
	end if

	if not existe(repoPath & "/node_modules/.bin/electron") then
		avisar("Faltan las dependencias de Node.", "No esta node_modules/.bin/electron." & return & return & "Ejecuta en el proyecto:" & return & "npm install")
		return
	end if

	if not existe(repoPath & "/.venv/bin/python") then
		avisar("Falta el entorno Python (.venv).", "Sin el, MAO arranca en modo degradado solo-JS: sin backend de analisis morfometrico." & return & return & "Ejecuta en el proyecto:" & return & "python3 -m venv .venv" & return & ".venv/bin/python -m pip install -r requirements.txt -r requirements-dev.txt")
		return
	end if

	-- PATH minimo de 'do shell script' no incluye /usr/local/bin, donde vive node.
	do shell script "export PATH=/usr/local/bin:$PATH && cd " & quoted form of repoPath & " && ./node_modules/.bin/electron . > " & quoted form of logPath & " 2>&1 &"
end run
