-- MAO Plus — lanzador de desarrollo
-- Arranca Electron contra una copia de trabajo del repositorio.
--
-- El applet compilado vive DENTRO del repo, en la raiz: "MAO Plus (dev).app".
-- Por eso no hay ruta hardcodeada: deduce el repo de su propia ubicacion
-- (el padre del bundle), de modo que mover o clonar el repo no lo rompe.
-- Solo si se corre desde otra parte (p.ej. una copia en /Applications) cae
-- al fallbackRepoPath de abajo.
--
-- SELECTOR DE COPIA DE TRABAJO: ademas del repo principal, el proyecto puede
-- tener git worktrees en .claude/worktrees/ (ramas de trabajo en paralelo). El
-- applet arranca "electron ." contra el arbol que se elija, asi que el codigo
-- que corre es SIEMPRE el de esa copia, al dia, sin recompilar nada.
--
-- SIN PREGUNTAS INNECESARIAS: el dialogo solo aparece cuando hay mas de una
-- copia REALMENTE arrancable (con node_modules propio). Los worktrees recien
-- creados nacen sin dependencias, asi que antes el applet se paraba a preguntar
-- entre opciones que no podian arrancar: eso es lo que hacia lento el arranque.
-- Ahora, si solo una copia esta lista, se arranca directo y se avisa con una
-- notificacion. El dialogo vuelve solo si hay varias copias instaladas.
--
-- Es un lanzador de DESARROLLO: corre el codigo del repo, no un build empaquetado.
-- Para un bundle autonomo se usa `npm run package` (necesita runtime/ regenerado
-- con scripts/build-runtime.sh, o el backend Python no arranca al empaquetar).
--
-- Compilar/recompilar tras editar este fichero:
--   npm run launcher          (o: scripts/build-dev-launcher.sh)
-- Ese script tambien genera el icono desde icon.png.

property fallbackRepoPath : "/Users/juanramirez/Developer/mao-plus"
property logPath : "/tmp/mao_launch.log"
-- El PATH minimo de 'do shell script' no incluye donde vive node.
property extraPath : "/usr/local/bin:/opt/homebrew/bin"

on existe(p)
	try
		do shell script "test -e " & quoted form of p
		return true
	end try
	return false
end existe

on avisar(titulo, detalle)
	display dialog titulo & return & return & detalle buttons {"OK"} default button "OK" with icon caution with title "MAO Plus"
end avisar

-- Ultimo tramo de una ruta, sin gastar una llamada al shell en un basename.
on nombreDe(ruta)
	set prev to AppleScript's text item delimiters
	set AppleScript's text item delimiters to "/"
	set tramos to text items of ruta
	set AppleScript's text item delimiters to prev
	repeat with i from (count of tramos) to 1 by -1
		if (item i of tramos) is not "" then return item i of tramos
	end repeat
	return ruta
end nombreDe

-- El repo es el directorio que contiene a este applet. Si el applet se copio
-- fuera del repo, se usa la ruta de respaldo.
on resolverRepo()
	try
		set aqui to POSIX path of (path to me)
		set candidato to do shell script "dirname " & quoted form of aqui
		if existe(candidato & "/package.json") and existe(candidato & "/main.js") then
			return candidato
		end if
	end try
	return fallbackRepoPath
end resolverRepo

-- Inventario de copias de trabajo en UNA sola llamada al shell (antes eran ~4
-- por copia: basename + branch + rev-parse + test). Devuelve una lista de
-- listas {ruta, rama, tieneNode, tieneVenv}, con "si"/"no" en los dos ultimos.
on inventario(repoBase)
	set guion to "for d in " & quoted form of repoBase & " " & quoted form of (repoBase & "/.claude/worktrees") & "/*/; do " & ¬
		"d=\"${d%/}\"; " & ¬
		"[ -f \"$d/package.json\" ] && [ -f \"$d/main.js\" ] || continue; " & ¬
		"r=$(git -C \"$d\" branch --show-current 2>/dev/null); " & ¬
		"[ -n \"$r\" ] || r=\"HEAD suelto en $(git -C \"$d\" rev-parse --short HEAD 2>/dev/null)\"; " & ¬
		"[ -n \"$r\" ] || r=\"sin rama\"; " & ¬
		"n=no; [ -x \"$d/node_modules/.bin/electron\" ] && n=si; " & ¬
		"v=no; [ -x \"$d/.venv/bin/python\" ] && v=si; " & ¬
		"printf '%s\\t%s\\t%s\\t%s\\n' \"$d\" \"$r\" \"$n\" \"$v\"; " & ¬
		"done 2>/dev/null"

	set salida to ""
	try
		set salida to do shell script guion
	end try

	set filas to {}
	if salida is "" then return filas
	set prev to AppleScript's text item delimiters
	repeat with ln in paragraphs of salida
		set AppleScript's text item delimiters to tab
		set campos to text items of (contents of ln)
		if (count of campos) is 4 then set end of filas to campos
	end repeat
	set AppleScript's text item delimiters to prev
	return filas
end inventario

-- Etiqueta legible: "principal — rama" o "worktree X — rama", con el aviso de
-- lo que le falte a esa copia.
on etiqueta(fila, repoBase)
	set ruta to item 1 of fila
	set nombre to "principal"
	if ruta is not repoBase then set nombre to "worktree " & nombreDe(ruta)

	set aviso to ""
	if (item 3 of fila) is "no" then
		set aviso to "   [sin dependencias — npm install]"
	else if (item 4 of fila) is "no" then
		set aviso to "   [sin .venv — arrancaria solo-JS]"
	end if

	return nombre & " — " & (item 2 of fila) & aviso
end etiqueta

on preguntar(filas, repoBase)
	set etiquetas to {}
	repeat with f in filas
		set end of etiquetas to etiqueta(contents of f, repoBase)
	end repeat

	set elegida to choose from list etiquetas ¬
		with title "MAO Plus (dev)" ¬
		with prompt "¿Qué copia de trabajo quieres arrancar?" ¬
		default items {item 1 of etiquetas} ¬
		OK button name "Arrancar" cancel button name "Cancelar"

	if elegida is false then return missing value

	set escogida to item 1 of elegida
	repeat with i from 1 to count of etiquetas
		if (item i of etiquetas) is escogida then return item i of filas
	end repeat
	return item 1 of filas
end preguntar

-- Una copia sin node_modules no puede arrancar. En vez de un callejon sin
-- salida, se ofrece el comando exacto (hay que correrlo DENTRO de esa copia).
on ofrecerInstalacion(ruta)
	set orden to "cd " & quoted form of ruta & " && npm install"
	set resp to display dialog ¬
		"Esta copia no tiene dependencias de Node." & return & return & ¬
		"Falta node_modules/.bin/electron en:" & return & ruta & return & return & ¬
		"Comando para instalarlas:" & return & orden ¬
		buttons {"Cancelar", "Copiar comando"} default button "Copiar comando" ¬
		with icon caution with title "MAO Plus (dev)"
	if button returned of resp is "Copiar comando" then set the clipboard to orden
end ofrecerInstalacion

on arrancar(ruta)
	do shell script "export PATH=" & extraPath & ":$PATH && cd " & quoted form of ruta & ¬
		" && { date '+== %F %T — arrancando desde '; pwd; } > " & quoted form of logPath & ¬
		" && ./node_modules/.bin/electron . >> " & quoted form of logPath & " 2>&1 &"
end arrancar

on run
	set repoBase to resolverRepo()

	if not existe(repoBase & "/package.json") then
		avisar("No encuentro el proyecto MAO Plus.", "Esperaba encontrarlo en:" & return & repoBase & return & return & "Este lanzador debe vivir en la raiz del repositorio; si lo copiaste fuera, devuelvelo a su sitio o recompilalo alli con: npm run launcher")
		return
	end if

	set filas to inventario(repoBase)
	if filas is {} then
		avisar("No encuentro ninguna copia de trabajo arrancable.", "Revisado:" & return & repoBase & return & repoBase & "/.claude/worktrees/")
		return
	end if

	-- Copias que pueden arrancar de verdad (con node_modules propio).
	set listas to {}
	repeat with f in filas
		if (item 3 of (contents of f)) is "si" then set end of listas to (contents of f)
	end repeat

	-- El dialogo solo tiene sentido si hay algo que elegir.
	if (count of filas) is 1 then
		set elegida to item 1 of filas
	else if (count of listas) is 1 then
		set elegida to item 1 of listas
		try
			display notification etiqueta(elegida, repoBase) ¬
				with title "MAO Plus (dev)" subtitle "Única copia con dependencias — arrancando"
		end try
	else
		set elegida to preguntar(filas, repoBase)
		if elegida is missing value then return -- cancelado por el usuario
	end if

	set ruta to item 1 of elegida

	if (item 3 of elegida) is "no" then
		ofrecerInstalacion(ruta)
		return
	end if

	-- Sin .venv el backend Python no arranca, pero la app SI corre en modo
	-- degradado solo-JS: se avisa y se deja decidir, no se bloquea.
	if (item 4 of elegida) is "no" then
		set resp to display dialog ¬
			"Falta el entorno Python (.venv) en esta copia." & return & return & ¬
			"MAO arrancaria en modo degradado solo-JS: sin backend de analisis morfometrico." & return & return & ¬
			"Copia afectada:" & return & ruta & return & return & ¬
			"Para crearlo, ahi dentro:" & return & ¬
			"python3 -m venv .venv" & return & ¬
			".venv/bin/python -m pip install -r requirements.txt -r requirements-dev.txt" ¬
			buttons {"Cancelar", "Arrancar solo-JS"} default button "Cancelar" ¬
			with icon caution with title "MAO Plus (dev)"
		if button returned of resp is "Cancelar" then return
	end if

	arrancar(ruta)
end run
