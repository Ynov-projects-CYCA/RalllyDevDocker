# Architecture Technique - Dev avec Docker

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
