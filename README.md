# Luma Home Dashboard

Modernes, modulares Home-Dashboard mit lokalem Python/SQLite-Backend. Es werden keine zusätzlichen Pakete benötigt.

## Automatische Installation

Auf Debian, Ubuntu oder Raspberry Pi OS:

```bash
chmod +x install.sh
sudo ./install.sh
```

Das Skript installiert Python und Nginx, richtet den automatischen Systemstart ein und zeigt bei der ersten Installation einen zufälligen Admin-Benutzernamen samt Passwort an. Bei erneutem Ausführen bleiben Benutzer und Dashboard-Daten erhalten.

## Manueller Start

```bash
cd /var/www/html
python3 server.py
```

Danach `http://localhost:8080` öffnen.

Erster Login:

- Benutzername: `admin`
- Passwort: `admin`

Beim ersten Login muss sofort ein eigenes Passwort mit mindestens acht Zeichen gesetzt werden.

Optional kann ein anderer Port verwendet werden:

```bash
DASHBOARD_PORT=3000 python3 server.py
```

Die Daten werden lokal in `dashboard.db` abgelegt. Diese Datei sollte regelmässig gesichert und nicht öffentlich ausgeliefert werden. Für öffentlich erreichbare Installationen sollte vor dem Server ein HTTPS-Reverse-Proxy betrieben werden.

## Docker, GitHub und Portainer

Das Repository enthält ein `Dockerfile`, eine `compose.yml` und einen GitHub-Workflow. Bei jedem Push auf `main` baut GitHub ein Image unter `ghcr.io/<github-name>/<repository>:latest`.

In Portainer unter **Stacks → Add stack → Git Repository** dieses Repository auswählen und als Compose-Pfad `compose.yml` eintragen. Anschliessend folgende Umgebungsvariablen in Portainer setzen:

```text
DASHBOARD_IMAGE=ghcr.io/riveria-it/riveria-dashboard-2.0:latest
DASHBOARD_ADMIN_USERNAME=admin
DASHBOARD_ADMIN_PASSWORD=<sicheres-passwort>
```

Optional kann der veröffentlichte Port über `DASHBOARD_HTTP_PORT` geändert werden. Die persistente Datenbank liegt im Docker-Volume `luma-dashboard-data` und wird nicht im Repository gespeichert.
