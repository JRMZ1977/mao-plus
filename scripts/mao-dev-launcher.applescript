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
-- que corre es SIEMPRE el de esa copia, al dia, sin recompilar nada. Si solo
-- existe el repo principal, arranca directo sin preguntar.
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

-- Copias de trabajo disponibles: el repo principal y los git worktrees que
-- cuelgan de .claude/worktrees/. Solo se listan las que parecen un checkout de
-- MAO (package.json + main.js). Devuelve rutas POSIX, una por linea.
on listarCopias(repoBase)
	set guion to "printf '%s\\n' " & quoted form of repoBase & "; " & ¬
		"for d in " & quoted form of repoBase & "/.claude/worktrees/*/; do " & ¬
		"[ -f \"$d/package.json\" ] && [ -f \"$d/main.js\" ] && printf '%s\\n' \"${d%/}\"; " & ¬
		"done 2>/dev/null || true"
	try
		set salida to do shell script guion
	on error
		return {repoBase}
	end try
	if salida is "" then return {repoBase}
	return paragraphs of salida
end listarCopias

-- Etiqueta legible de una copia: rama actual y aviso si le faltan dependencias.
-- git vive en /usr/bin, que si esta en el PATH minimo de 'do shell script'.
on describir(ruta, repoBase)
	set nombre to "principal"
	if ruta is not repoBase then
		try
			set nombre to "worktree " & (do shell script "basename " & quoted form of ruta)
		end try
	end if

	set rama to "sin rama"
	try
		set rama to do shell script "git -C " & quoted form of ruta & " branch --show-current 2>/dev/null"
		if rama is "" then
			set rama to "HEAD suelto en " & (do shell script "git -C " & quoted form of ruta & " rev-parse --short HEAD 2>/dev/null")
		end if
	end try

	set aviso to ""
	if not existe(ruta & "/node_modules/.bin/electron") then set aviso to "   [faltan dependencias]"

	return nombre & " — " & rama & aviso
end describir

-- Si hay mas de una copia, se pregunta cual arrancar. El repo principal va
-- primero y es la opcion por defecto.
on elegirCopia(copias, repoBase)
	if (count of copias) is 1 then return item 1 of copias

	set etiquetas to {}
	repeat with r in copias
		set end of etiquetas to describir(contents of r, repoBase)
	end repeat

	set elegida to choose from list etiquetas ¬
		with title "MAO Plus (dev)" ¬
		with prompt "¿Qué copia de trabajo quieres arrancar?" ¬
		default items {item 1 of etiquetas} ¬
		OK button name "Arrancar" cancel button name "Cancelar"

	if elegida is false then return ""

	set escogida to item 1 of elegida
	repeat with i from 1 to count of etiquetas
		if (item i of etiquetas) is escogida then return item i of copias
	end repeat
	return item 1 of copias
end elegirCopia

on run
	set repoBase to resolverRepo()

	if not existe(repoBase & "/package.json") then
		avisar("No encuentro el proyecto MAO Plus.", "Esperaba encontrarlo en:" & return & repoBase & return & return & "Este lanzador debe vivir en la raiz del repositorio; si lo copiaste fuera, devuelvelo a su sitio o recompilalo alli con: npm run launcher")
		return
	end if

	set repoPath to elegirCopia(listarCopias(repoBase), repoBase)
	if repoPath is "" then return -- cancelado por el usuario

	-- Los worktrees nacen sin dependencias propias: se avisa con su ruta exacta,
	-- porque npm/pip hay que ejecutarlos DENTRO de esa copia, no en el principal.
	if not existe(repoPath & "/node_modules/.bin/electron") then
		avisar("Faltan las dependencias de Node en esta copia.", "No esta node_modules/.bin/electron en:" & return & repoPath & return & return & "Ejecuta ahi dentro:" & return & "npm install")
		return
	end if

	if not existe(repoPath & "/.venv/bin/python") then
		avisar("Falta el entorno Python (.venv) en esta copia.", "Sin el, MAO arranca en modo degradado solo-JS: sin backend de analisis morfometrico." & return & return & "Copia afectada:" & return & repoPath & return & return & "Ejecuta ahi dentro:" & return & "python3 -m venv .venv" & return & ".venv/bin/python -m pip install -r requirements.txt -r requirements-dev.txt")
		return
	end if

	-- PATH minimo de 'do shell script' no incluye /usr/local/bin, donde vive node.
	do shell script "export PATH=/usr/local/bin:$PATH && cd " & quoted form of repoPath & " && ./node_modules/.bin/electron . > " & quoted form of logPath & " 2>&1 &"
end run
