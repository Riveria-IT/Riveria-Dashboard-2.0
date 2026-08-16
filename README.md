# Riveria Dashboard 2.0

Modernes, modulares Home-Dashboard mit Python-Backend und lokaler SQLite-Datenbank. Das Dashboard unterstützt mehrere Benutzer, frei konfigurierbare Widgets, Geräteprüfung und Wake-on-LAN.

## Empfohlene Installation: Portainer

Das Repository enthält bereits die benötigte [`compose.yml`](compose.yml). Portainer kann sie direkt aus GitHub laden. Es müssen keine Projektdateien manuell auf den Docker-Server kopiert werden.

### Voraussetzungen

- Linux-Server mit Docker
- Portainer mit Zugriff auf die Docker-Umgebung
- Freier TCP-Port `8080` oder ein anderer gewünschter Port
- Zugriff auf dieses GitHub-Repository

### Schritt 1: Docker-Image öffentlich freigeben

Das fertige Docker-Image wird bei Änderungen automatisch von GitHub Actions erstellt:

```text
ghcr.io/riveria-it/riveria-dashboard-2.0:latest
```

Damit Portainer das Image ohne GitHub-Anmeldung laden kann, muss das Paket öffentlich sein:

1. Auf GitHub das Profil `Riveria-IT` öffnen.
2. **Packages** auswählen.
3. Das Paket **riveria-dashboard-2.0** öffnen.
4. **Package settings** öffnen.
5. Unter **Change visibility** die Sichtbarkeit auf **Public** stellen.

Ist das Paket bereits öffentlich, kann dieser Schritt übersprungen werden. Soll es privat bleiben, muss `ghcr.io` stattdessen mit einem GitHub Personal Access Token als Registry in Portainer eingerichtet werden.

### Schritt 2: Stack in Portainer erstellen

1. In Portainer die gewünschte Docker-Umgebung öffnen.
2. Links **Stacks** auswählen.
3. **Add stack** anklicken.
4. Als Namen `riveria-dashboard` eintragen.
5. Als Build-Methode **Git Repository** auswählen.
6. Folgende Werte eintragen:

```text
Repository URL:       https://github.com/Riveria-IT/Riveria-Dashboard-2.0.git
Repository reference: refs/heads/main
Compose path:         compose.yml
```

Da Repository und Container-Image öffentlich sind, bleibt **Authentication** ausgeschaltet.

### Schritt 3: Umgebungsvariablen setzen

Im Abschnitt **Environment variables** mindestens diese Werte hinzufügen:

| Name | Beispielwert | Bedeutung |
| --- | --- | --- |
| `DASHBOARD_ADMIN_USERNAME` | `admin` | Benutzername des ersten Administrators |
| `DASHBOARD_ADMIN_PASSWORD` | `Ein-langes-sicheres-Passwort` | Passwort des ersten Administrators |

Optional können folgende Werte gesetzt werden:

| Name | Standardwert | Bedeutung |
| --- | --- | --- |
| `DASHBOARD_HTTP_PORT` | `8080` | Port, unter dem das Dashboard erreichbar ist |
| `TZ` | `Europe/Berlin` | Zeitzone des Containers |
| `DASHBOARD_IMAGE` | `ghcr.io/riveria-it/riveria-dashboard-2.0:latest` | Zu verwendendes Container-Image |

Das Admin-Passwort nicht in die `compose.yml` schreiben und nicht auf GitHub veröffentlichen. Die Admin-Variablen werden nur beim Erstellen einer neuen, leeren Datenbank verwendet. Bei späteren Updates bleiben bestehende Benutzer und Passwörter unverändert.

### Schritt 4: Stack starten

1. Unten auf **Deploy the stack** klicken.
2. Warten, bis der Container `luma-dashboard` den Status **healthy** anzeigt.
3. Im Browser folgende Adresse öffnen:

```text
http://IP-DES-DOCKER-SERVERS:8080
```

Wurde `DASHBOARD_HTTP_PORT` geändert, muss statt `8080` der dort eingetragene Port verwendet werden.

### Schritt 5: Erster Login

Mit den in Portainer gesetzten Werten anmelden:

```text
Benutzername: Wert aus DASHBOARD_ADMIN_USERNAME
Passwort:     Wert aus DASHBOARD_ADMIN_PASSWORD
```

Danach können im Administrationsbereich weitere Benutzer angelegt werden.

## Installation mit Docker Compose

Ohne Portainer kann der Stack ebenfalls direkt gestartet werden:

```bash
git clone https://github.com/Riveria-IT/Riveria-Dashboard-2.0.git
cd Riveria-Dashboard-2.0
export DASHBOARD_ADMIN_USERNAME=admin
export DASHBOARD_ADMIN_PASSWORD='Ein-langes-sicheres-Passwort'
docker compose up -d
```

Status und Logs prüfen:

```bash
docker compose ps
docker compose logs -f luma-dashboard
```

## Updates in Portainer

Bei jedem Push auf `main` erstellt GitHub Actions automatisch ein neues `latest`-Image. Für ein manuelles Update:

1. Den Stack `riveria-dashboard` in Portainer öffnen.
2. **Pull and redeploy** auswählen.
3. Das erneute Laden des Images bestätigen.

Die Datenbank liegt in einem Docker-Volume und bleibt bei einem normalen Update oder erneuten Deployment erhalten.

## Daten und Backup

Dashboard-Daten, Benutzer und Sitzungen werden in `dashboard.db` innerhalb des Docker-Volumes gespeichert. Dieses Volume wird durch die `compose.yml` angelegt und nicht auf GitHub hochgeladen.

Vor grösseren Updates sollte das zugehörige Volume über die Backup-Lösung des Docker-Servers beziehungsweise über Portainer gesichert werden. Das Löschen des Stacks mit aktivierter Option zum Entfernen der Volumes löscht auch die Dashboard-Daten. Diese Option deshalb nur verwenden, wenn die Daten wirklich entfernt werden sollen.

## Fehlerbehebung

### `denied` oder `unauthorized` beim Image-Pull

Das GHCR-Paket ist noch privat. Das Paket wie in Schritt 1 beschrieben auf **Public** stellen oder `ghcr.io` in Portainer authentifizieren.

### `DASHBOARD_ADMIN_PASSWORD` fehlt

In Portainer unter den Stack-Umgebungsvariablen einen Wert für `DASHBOARD_ADMIN_PASSWORD` eintragen und den Stack erneut deployen.

### Port `8080` wird bereits verwendet

In Portainer beispielsweise folgende Variable ergänzen:

```text
DASHBOARD_HTTP_PORT=8081
```

Das Dashboard ist danach unter `http://IP-DES-SERVERS:8081` erreichbar.

### Login-Daten funktionieren nach einem Update nicht

Die Admin-Variablen ändern nur eine neue, leere Datenbank. Existiert bereits eine Datenbank, gelten weiterhin die darin gespeicherten Zugangsdaten.

## Klassische Installation ohne Docker

Auf Debian, Ubuntu oder Raspberry Pi OS:

```bash
chmod +x install.sh
sudo ./install.sh
```

Das Skript installiert Python und Nginx, richtet den automatischen Systemstart ein und zeigt bei einer Erstinstallation zufällige Admin-Zugangsdaten an.

Alternativ kann der Server manuell gestartet werden:

```bash
python3 server.py
```

Standardmässig ist das Dashboard danach unter `http://localhost:8080` erreichbar. Die lokale Datenbank wird als `dashboard.db` im Projektverzeichnis angelegt.

## Sicherheit

- `dashboard.db`, Sicherungskopien und `.env` niemals auf GitHub hochladen.
- Für einen Zugriff aus dem Internet einen HTTPS-Reverse-Proxy verwenden.
- Ein langes, individuelles Admin-Passwort verwenden.
- Das Datenbank-Volume regelmässig sichern.
