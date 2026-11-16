# Architecture Technique - Dev avec Docker

## Lancement autonome et deploiement Coolify

Le service Traefik du projet est reserve au profil `standalone`. Pour lancer
la stack locale avec les domaines `*.localhost` :

```sh
docker compose --profile standalone up -d --build
```

Dans Coolify, utiliser `docker-compose.yml` sans activer le profil `standalone`
ni definir `COMPOSE_PROFILES=standalone`. Le proxy de Coolify gere les ports
80/443 ; lancer un second Traefik sur ces ports provoque l'erreur
`Bind for 0.0.0.0:80 failed: port is already allocated`.

Dans les domaines de Coolify, associer chaque domaine au service et au port
interne correspondants :

| Service | Exemple de domaine dans Coolify |
|---|---|
| `rallly-web` | `https://rallly.example.com:3000` |
| `authentik-server` | `https://auth.example.com:9000` |

Le suffixe de port indique la cible interne du proxy ; l'URL publique utilise
le port HTTPS standard. Configurer les DNS de ces domaines vers le serveur.
Mailpit reste accessible aux services SMTP via `mailpit:1025` sans domaine public.

Definir aussi les variables suivantes dans Coolify avec les vrais domaines :

```dotenv
RALLLY_HOSTNAME=rallly.example.com
AUTHENTIK_HOSTNAME=auth.example.com
RALLLY_BASE_URL=https://rallly.example.com
OIDC_DISCOVERY_URL=https://auth.example.com/application/o/rallly/.well-known/openid-configuration
```

Dans Authentik, configurer le fournisseur OIDC et son URL de redirection avec
le domaine public de Rallly ; reporter ses identifiants dans `OIDC_CLIENT_ID`
et `OIDC_CLIENT_SECRET`.

Reference : [Docker Compose dans Coolify](https://coolify.io/docs/applications/builds/docker-compose).

## 1. Vue d'Ensemble

Ce projet orchestre une suite applicative multi-services conteneurisee repondant au cahier des charges du module *Dev avec Docker* (M2 DEVFULLSTACK) :
- **Reverse Proxy** : Traefik v3 (point d'entree unique, ports 80 et 443).
- **Identity Provider (IdP)** : Authentik v2024.8 (serveur web et worker asynchrone).
- **Application Web** : Rallly v4 (compilee localement depuis le depot).
- **Bases de Donnees & Cache** : Deux instances PostgreSQL 16 distinctes et isolees, et une instance Redis 7.
- **Laboratoire SMTP** : Mailpit (capture des courriels et invitations sans envoi externe).

---

## 2. Diagramme des Flux et Reseaux

```text
[ Navigateur Client ]
       │
       ▼ (Ports 80 / 443)
┌────────────────────────────────────────────────────────────────────────┐
│                        Traefik v3 (Reverse Proxy)                      │
└──────┬────────────────────────────┬────────────────────────────┬───────┘
       │ rallly.localhost           │ auth.localhost             │ mail.localhost
       ▼                            ▼                            ▼
┌──────────────┐             ┌──────────────┐             ┌──────────────┐
│  rallly-web  │             │  authentik   │             │   mailpit    │
│   (Next.js)  │             │   (serveur)  │             │ (Web :8025)  │
└──────┬───────┘             └──────┬───────┘             └──────────────┘
       │                            │                            ▲
       │ OIDC Discovery / Callback  │                            │ Envoi SMTP (:1025)
       └────────────────────────────┘                            │
       │                                                         │
       │ (rallly-internal-net)     (authentik-internal-net)      │
       ▼                                    ▼                    │
┌──────────────┐             ┌──────────────┐                    │
│    rallly    │             │  authentik   │                    │
│  postgresql  │             │  postgresql  │                    │
└──────────────┘             └──────────────┘                    │
                                    │                            │
                                    ▼                            │
                             ┌──────────────┐                    │
                             │  authentik   │                    │
                             │    redis     │                    │
                             └──────────────┘                    │
                                    ▲                            │
                                    │ Taches asynchrones         │
                             ┌──────┴───────┐                    │
                             │  authentik   │                    │
                             │   (worker)   ├────────────────────┘
                             └──────────────┘
```

---

## 3. Matrice des Ports et Routage

| Service | Hote / Port Expose | Port Interne | Domaine Traefik | Role |
|---|---|---|---|---|
| **Traefik** | `80` (HTTP), `443` (HTTPS) | 80, 443 | - | Point d'entree unique |
| **Traefik Dashboard** | `8080` | 8080 | `localhost:8080` | Supervision des routes |
| **Rallly Web** | Aucun direct | 3000 | `rallly.localhost` | Application de sondage |
| **Authentik Web** | Aucun direct | 9000 | `auth.localhost` | Portail SSO / OIDC |
| **Mailpit** | Aucun direct | 8025 | `mail.localhost` | Visualiseur d'e-mails |
| **Authentik PostgreSQL** | Aucun (isole) | 5432 | - | BDD Authentik |
| **Authentik Redis** | Aucun (isole) | 6379 | - | Cache Authentik |
| **Rallly PostgreSQL** | `5450` (option dev) | 5432 | - | BDD Rallly |

---

## 4. Cloisonnement Reseau et Securite

La configuration definit 4 reseaux distincts :
1. **`traefik-net`** : Reseau d'entree reliant Traefik aux interfaces web (Rallly, Authentik, Mailpit).
2. **`app-net`** : Reseau transverse permettant a Rallly et Authentik d'emettre vers le serveur SMTP Mailpit.
3. **`authentik-internal-net`** : Reseau prive interne (`internal: true`) strictement reserve a la communication entre Authentik (serveur + worker) et ses bases (PostgreSQL + Redis).
4. **`rallly-internal-net`** : Reseau reliant Rallly a sa base PostgreSQL dediee.
