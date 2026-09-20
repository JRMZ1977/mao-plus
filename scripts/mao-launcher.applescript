-- MAO Plus — lanzador
--
-- Arranca la aplicación contra la copia de trabajo del repositorio, de modo que
-- el código que corre es SIEMPRE el que hay en el repo: no hay bundle que se
-- quede viejo porque no hay bundle. Eso es lo que lo hace «autoactualizable».
--
-- Sustituye a dos lanzadores anteriores:
--   · "MAO Plus (dev).app", que vivía dentro del repo y preguntaba entre copias
--     de trabajo. La pregunta sobraba: la copia canónica es la principal, y para
--     arrancar un worktree concreto está `npm start` dentro de él.
--   · "/Applications/MAO Plus.app" 1.2.0 (junio), un bundle congelado que no
--     podía actualizarse.
--
-- NO TOCA EL REPOSITORIO. Ni pull, ni checkout, ni stash. Tras arrancar lanza en
-- segundo plano scripts/mao-launcher-check.sh, que mira el estado de git y avisa
-- si origin va por delante, si la rama no es main o si hay cambios sin commitear.
-- La comprobación va DESPUÉS del arranque para que la red nunca lo retrase.
--
-- La ruta del repositorio la inyecta scripts/build-launcher.sh al compilar, así
-- que el applet funciona desde /Applications sin rutas escritas a mano aquí.
--
-- Recompilar tras editar:  npm run launcher

property repoPath : "@@REPO@@"
property logPath : "/tmp/mao_launch.log"
-- El PATH mínimo de 'do shell script' no incluye donde vive node.
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

-- Si el applet vive dentro del repo, se usa ese repo; si está en /Applications,
-- la ruta inyectada al compilar.
on resolverRepo()
	try
		set aqui to POSIX path of (path to me)
		set candidato to do shell script "dirname " & quoted form of aqui
		if existe(candidato & "/package.json") and existe(candidato & "/main.js") then
			return candidato
		end if
	end try
	return repoPath
end resolverRepo

-- Sin node_modules no hay Electron que arrancar. En vez de un callejón sin
-- salida, se ofrece el comando exacto.
on ofrecerInstalacion(ruta)
	set orden to "cd " & quoted form of ruta & " && npm install"
	set resp to display dialog ¬
		"Faltan las dependencias de Node." & return & return & ¬
		"No encuentro node_modules/.bin/electron en:" & return & ruta & return & return & ¬
		"Comando para instalarlas:" & return & orden ¬
		buttons {"Cancelar", "Copiar comando"} default button "Copiar comando" ¬
		with icon caution with title "MAO Plus"
	if button returned of resp is "Copiar comando" then set the clipboard to orden
end ofrecerInstalacion

on arrancar(ruta)
	do shell script "export PATH=" & extraPath & ":$PATH && cd " & quoted form of ruta & ¬
		" && { date '+== %F %T — arrancando desde '; pwd; } > " & quoted form of logPath & ¬
		" && ./node_modules/.bin/electron . >> " & quoted form of logPath & " 2>&1 &"
end arrancar

-- La comprobación de git va en segundo plano y en su propio script: así la red
-- no retrasa el arranque y se puede editar sin recompilar el applet.
on comprobarEstado(ruta)
	set guion to ruta & "/scripts/mao-launcher-check.sh"
	if not existe(guion) then return
	try
		do shell script "export PATH=" & extraPath & ":$PATH && /bin/bash " & ¬
			quoted form of guion & " " & quoted form of ruta & " >/dev/null 2>&1 &"
	end try
end comprobarEstado

on run
	set repoBase to resolverRepo()

	if not (existe(repoBase & "/package.json") and existe(repoBase & "/main.js")) then
		avisar("No encuentro el proyecto MAO Plus.", ¬
			"Esperaba encontrarlo en:" & return & repoBase & return & return & ¬
			"Si moviste el repositorio, recompila el lanzador desde su nueva ubicación con:" & return & ¬
			"npm run launcher")
		return
	end if

	if not existe(repoBase & "/node_modules/.bin/electron") then
		ofrecerInstalacion(repoBase)
		return
	end if

	-- Sin .venv el backend Python no arranca y la app cae a modo solo-JS. Se
	-- avisa, pero no se bloquea: ese modo degradado es deliberado y funciona.
	if not existe(repoBase & "/.venv/bin/python") then
		try
			display notification "Sin .venv: arrancará en modo solo-JS (sin backend Python)" ¬
				with title "MAO Plus" subtitle "Aviso"
		end try
	end if

	arrancar(repoBase)
	comprobarEstado(repoBase)
end run
