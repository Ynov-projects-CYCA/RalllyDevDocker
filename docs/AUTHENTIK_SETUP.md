# Guide de Configuration Authentik : OIDC, Groupes & Invitations

Ce document detaille la configuration appliquee dans Authentik pour repondre aux exigences du cahier des charges (§3.4).

---

## 1. Initialisation et Acces Administrateur

Le compte administrateur a ete initialise et configure avec les identifiants suivants :
- **URL d'administration** : [http://auth.localhost](http://auth.localhost)
- **Identifiant / E-mail** : `admin@rallly.local` (saisie obligatoire de l'e-mail dans Authentik)
- **Mot de passe** : `AdminDevDocker2026!`

---

## 2. Configuration du Provider OAuth2 / OpenID Connect

Le Provider OIDC est configure et operationnel :
- **Nom** : `Rallly OIDC Provider`
- **Type de client** : `Confidential`
- **Client ID** : `rallly-client-id`
- **Client Secret** : `rallly-client-secret`
- **Redirect URIs** : `http://rallly.localhost/api/auth/callback/oidc`
- **Flux d'autorisation** : `default-provider-authorization-implicit-consent`
- **Cle de signature** : `authentik Self-signed Certificate`
- **Scopes associes** : `openid`, `email`, `profile`
- **Point de decouverte OIDC** : `http://auth.localhost/application/o/rallly/.well-known/openid-configuration`

---

## 3. Application Rallly dans Authentik

L'application Rallly est liee au Provider OIDC :
- **Nom** : `Rallly`
- **Slug** : `rallly`
- **Provider associe** : `Rallly OIDC Provider`

---

## 4. Groupes et Politiques d'Acces (§3.4)

Deux groupes distincts ont ete crees dans Authentik :
- **`Organisateurs`** : Groupe destine aux administrateurs et createurs de sondages (le compte `akadmin` en fait partie).
- **`Participants`** : Groupe destine aux votants et utilisateurs standards.

Une regle de filtrage (**PolicyBinding**) a ete activee sur l'application Rallly :
- Seuls les utilisateurs membres du groupe **`Organisateurs`** sont autorises a ouvrir une session sur l'application Rallly.
- Les membres du groupe **`Participants`** ou les utilisateurs non affilies recoivent un refus d'acces explicite lors de la tentative de connexion SSO.

---

## 5. Flux d'Invitation d'un Utilisateur Externe (§3.4)

Pour inviter un utilisateur externe :
1. Dans l'interface d'administration Authentik ([http://auth.localhost](http://auth.localhost)), aller dans **Directory** > **Invitations**.
2. Cliquer sur **Create**.
3. Renseigner l'adresse e-mail cible (ex: `etudiant@demo.local`) et la date d'expiration.
4. L'e-mail d'invitation contenant le lien unique est capture automatiquement par **Mailpit**.
5. Ouvrir [http://mail.localhost](http://mail.localhost) pour recuperer l'e-mail et completer l'inscription.
