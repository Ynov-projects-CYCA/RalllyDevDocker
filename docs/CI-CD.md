# CI et déploiement de Rallly sur la VM

Ce guide décrit la configuration mise en place et validée le 18 novembre 2026.

## Fonctionnement

1. Une modification est fusionnée ou poussée sur `main`.
2. GitHub Actions construit l’image personnalisée de Rallly depuis le dépôt.
3. Si la construction réussit, le workflow publie l’image privée sur GHCR.
4. Après la publication, le job `deploy` est exécuté sur le runner `rallly-vm`, installé sur la VM.
5. Le runner télécharge l’image, met à jour uniquement `rallly-web` et attend son état de santé pendant 180 secondes au maximum.

La construction, la publication et le déploiement applicatif sont automatiques après un push ou une fusion sur `main`, si les jobs réussissent et que le runner reste disponible.

Les pull requests déclenchent une construction sans publication ni déploiement. Un lancement manuel via `workflow_dispatch` sur `main` construit et publie l’image mais ne déploie pas : le job `deploy` exige un événement `push`.

La concurrence du workflow est limitée par branche avec `group: rallly-${{ github.ref }}` et `cancel-in-progress: false`, afin de ne pas exécuter simultanément plusieurs pipelines de cette branche.

## Ressources et preuves

- Dépôt : https://github.com/Ynov-projects-CYCA/RalllyDevDocker
- Workflow : `.github/workflows/docker-image.yml`
- Historique des exécutions : https://github.com/Ynov-projects-CYCA/RalllyDevDocker/actions/workflows/docker-image.yml
- Image : `ghcr.io/ynov-projects-cyca/ralllydevdocker:latest`
- Tags publiés : `latest` et le SHA complet du commit.
- Construction : `apps/web/Dockerfile`, plateforme `linux/amd64`, argument `SELF_HOSTED=true`.

Le 18 novembre 2026, une exécution verte sur `main`, pour le commit commençant par `550a704`, a été constatée. L’image publiée a ensuite été téléchargée et utilisée sur la VM. Les contrôles de santé des services étaient au vert et la connexion Authentik vers Rallly a été testée avec succès après ajout du compte au groupe `Organisateurs`.

Le déploiement automatique a ensuite été validé le 18 novembre 2026 pour le commit commençant par `4c2caa2`. Les deux jobs `docker` et « Déployer Rallly sur la VM » ont réussi.

Preuve : https://github.com/Ynov-projects-CYCA/RalllyDevDocker/actions/runs/44303272608

Pour la soutenance, conserver ce lien permanent et les captures de la pipeline, du package et des services déployés.

## Authentification au registre privé

Dans GitHub Actions, la publication utilise `GITHUB_TOKEN` avec les permissions `contents: read` et `packages: write`.

Sur la VM, le téléchargement utilise un jeton GitHub classique disposant de `read:packages`. Son propriétaire doit avoir accès au package privé. Le jeton ne doit être placé ni dans le dépôt, ni dans le Dockerfile, ni dans une commande contenant sa valeur en clair.

La connexion se fait ainsi :

```bash
sudo docker login ghcr.io -u Comesarazin
```

Coller le jeton à l’invite `Password`. Docker affiche `Login Succeeded` si la connexion réussit.

Comme les commandes de déploiement utilisent `sudo`, la connexion au registre a également été effectuée avec `sudo`. Dans cette installation, Docker a indiqué enregistrer les identifiants dans `/root/.docker/config.json`. Ne pas publier ce fichier.

Si le jeton expire, renouveler le jeton puis refaire la connexion. Si l’organisation impose une autorisation SSO du jeton, celle-ci doit également être accordée.

## Runner de déploiement

Le runner est dédié au dépôt Rallly et installé dans `/home/come/actions-runner-rallly`, séparément du runner de Brume.

- Nom : `rallly-vm`.
- Utilisateur du service : `come`.
- Labels : `self-hosted`, `Linux`, `X64`, `rallly-deplloy`.
- Sélection dans le workflow : `runs-on: [self-hosted, linux, rallly-deplloy]`.
- Le double « l » dans `deplloy` fait partie du label réellement enregistré.
- Le service est installé avec `sudo ./svc.sh install come` puis démarré avec `sudo ./svc.sh start` depuis son dossier.

Le job `docker` compile sur un runner GitHub `ubuntu-latest`. Seul le job de déploiement s’exécute sur la VM. Le compte `come` a été vérifié capable d’utiliser le script Compose avec `sudo -n`, sans saisie de mot de passe.

Le runner installé sur la VM accède directement à Docker et au projet local ; il n’a pas besoin d’une connexion SSH entrante depuis GitHub. Le poste utilisé pour consulter les interfaces privées a toujours besoin du réseau campus ou du VPN NetBird.

Le job de déploiement ne récupère pas le code avec `checkout`. Il utilise le script et les fichiers Compose déjà présents dans `/opt/RalllyDevDocker`. Les changements de configuration Compose ne sont donc pas synchronisés automatiquement par cette pipeline.

### Étapes du job deploy

Le job attend `docker` avec `needs: docker`, exige un push sur `main` et dispose d’un délai maximal de 10 minutes. Il exécute :

```bash
sudo -n /opt/RalllyDevDocker/deploy-vm.sh config --quiet
sudo -n /opt/RalllyDevDocker/deploy-vm.sh pull rallly-web
sudo -n /opt/RalllyDevDocker/deploy-vm.sh up -d --no-build --no-deps --wait --wait-timeout 180 rallly-web
```

Puis il affiche l’état des services, même en cas d’échec. En cas d’erreur, il affiche aussi les 100 dernières lignes des journaux de Rallly.

`--no-deps` laisse les dépendances existantes en place : PostgreSQL, Authentik, Redis, Mailpit et Traefik doivent déjà être démarrés. Ce job met à jour Rallly ; il ne réalise pas l’installation initiale de toute la stack et ne gère pas Brume.

### Vérifier le runner

Sur GitHub : **Settings → Actions → Runners**. `Idle` indique qu’il attend un job ; `Offline` indique qu’il n’est pas connecté.

Sur la VM :

```bash
cd ~/actions-runner-rallly
sudo ./svc.sh status
```

Pour démarrer ou redémarrer le service de ce runner :

```bash
sudo ./svc.sh start
# Pour un redémarrage d’un service déjà actif :
sudo ./svc.sh stop
sudo ./svc.sh start
```

Le runner dispose de droits de déploiement sur la VM. Réserver ce job aux changements approuvés sur `main`, protéger cette branche et ne pas déplacer l’exécution de code de pull requests non fiables sur ce runner.

## Accéder à la VM

Le réseau privé campus / VPN NetBird doit être accessible depuis le poste utilisé.

```bash
ssh come@10.2.192.7
cd /opt/RalllyDevDocker
```

## Configuration Docker Compose

Le script `deploy-vm.sh` charge les trois fichiers suivants, dans cet ordre :

```text
docker-compose.yml
compose.vm.json
compose.vm.yml
```

Le fichier `compose.vm.yml` utilise l’image GHCR et retire la compilation locale héritée des autres fichiers :

```yaml
services:
  rallly-web:
    image: ghcr.io/ynov-projects-cyca/ralllydevdocker:latest
    build: !reset null
    ports: !reset []

  rallly-postgresql:
    ports: !reset []

  traefik:
    ports: !override
      - "8081:8081"
```

Ces balises YAML nécessitent une version de Docker Compose qui les prend en charge. Elles ont été validées avec la version installée sur cette VM.

Traefik publie le port 8081. Les services Rallly et PostgreSQL ne publient pas directement leurs ports sur l’hôte. Les ports 80 et 443 restent utilisés par le projet Filrouge / Brume.

Les secrets applicatifs sont conservés sur la VM, notamment dans `.env`, et transmis aux conteneurs par Compose. Ne pas versionner les secrets ni les intégrer à l’image.

## Déployer une nouvelle version

1. Faire les modifications dans une branche de travail.
2. Ouvrir une pull request vers `main` et vérifier la construction.
3. Fusionner la pull request dans `main`.
4. Dans Actions, vérifier que `docker` puis « Déployer Rallly sur la VM » sont tous les deux verts, et que le déploiement n’est pas ignoré.
5. Vérifier l’accès à Rallly et la connexion SSO si la modification concerne l’authentification.

Il n’est plus nécessaire de lancer `pull` et `up` à la main après chaque fusion réussie.

### Procédure manuelle de secours

Attendre la réussite de la publication de l’image avant une intervention manuelle. Éviter de mettre à jour le même service en parallèle d’un job de déploiement.

Sur la VM :

```bash
cd /opt/RalllyDevDocker
sudo ./deploy-vm.sh config --quiet
sudo ./deploy-vm.sh pull rallly-web
```

Si une commande échoue, corriger l’erreur avant de poursuivre.

Si toute la stack est arrêtée, la démarrer avec :

```bash
sudo ./deploy-vm.sh up -d --no-build
```

Si les autres services sont déjà actifs et qu’il faut seulement mettre à jour Rallly :

```bash
sudo ./deploy-vm.sh up -d --no-build --no-deps --wait --wait-timeout 180 rallly-web
```

Compose recrée le conteneur si l’image a changé. Les volumes persistants existants sont conservés. Le démarrage peut appliquer des migrations de base de données : prévoir une sauvegarde avant une mise à jour importante.

`latest` est un tag modifiable et constitue la cible actuelle du déploiement automatique. Pour identifier précisément une version déployée, relever son digest et le commit du workflow. Épingler l’image sur un tag SHA permet un déploiement déterministe ou un retour à une version précédente, mais impose d’adapter la procédure de mise à jour. Aucun retour arrière automatique n’est configuré ; revenir à une ancienne image ne restaure pas une base de données déjà migrée.

## Vérifier le déploiement

```bash
sudo ./deploy-vm.sh ps
sudo ./deploy-vm.sh logs --tail=50 rallly-web
```

Au démarrage, `health: starting` peut apparaître temporairement. Attendre puis relancer `ps`. Les services ayant un contrôle de santé doivent passer à `healthy`. Traefik doit être actif ; aucun contrôle de santé n’était défini pour lui dans cette configuration.

Dans les journaux de Rallly, vérifier notamment la connexion PostgreSQL, le résultat des migrations et le message de démarrage de Next.js.

Le message `No .env file found, continuing without it` dans les journaux Prisma n’est pas, à lui seul, une erreur : les variables peuvent être directement transmises au conteneur par Compose.

Contrôle HTTP :

```bash
curl --fail http://rallly.10.2.192.7.nip.io:8081/api/status
```

Puis ouvrir les interfaces avec le VPN connecté :

- Rallly : http://rallly.10.2.192.7.nip.io:8081
- Authentik : http://auth.10.2.192.7.nip.io:8081
- Mailpit : http://mail.10.2.192.7.nip.io:8081

Tester la connexion depuis Rallly avec Authentik. La règle configurée réserve l’accès au groupe `Organisateurs`. Le compte `akadmin` a été ajouté à ce groupe par le propriétaire. L’appartenance à `Participants` seule ne donne pas accès à Rallly.

La configuration Traefik de la VM comprend une réécriture du callback historique `/api/auth/callback/oidc` vers `/api/better-auth/oauth2/callback/oidc`. Elle doit être conservée tant que le code déployé demande cette ancienne URL de retour.

## Arrêter et redémarrer le projet

Arrêter uniquement la stack Rallly en conservant ses conteneurs et ses données :

```bash
cd /opt/RalllyDevDocker
sudo ./deploy-vm.sh stop
```

La redémarrer :

```bash
sudo ./deploy-vm.sh up -d --no-build
```

Ces commandes ciblent le projet Rallly. Vérifier les autres conteneurs de la VM avec `docker ps` si nécessaire.

Un nouveau push sur `main` déclenchera une tentative de mise à jour de Rallly, même après un arrêt volontaire. Pour une maintenance, suspendre les déclenchements de déploiement, attendre la fin des jobs actifs et arrêter le service du runner Rallly si nécessaire. Les jobs en attente doivent être vérifiés avant sa remise en service.

Ne pas utiliser `down -v` pour un simple arrêt : cette option supprime les volumes gérés par Compose et peut entraîner la perte des bases de données.

## Dépannage courant

| Problème | Vérification |
|---|---|
| Job de déploiement en attente | Vérifier que `rallly-vm` est connecté et possède le label exact `rallly-deplloy`. |
| Job de déploiement ignoré | Vérifier que l’exécution vient d’un push sur `main`, et non d’une pull request ou d’un lancement manuel. |
| Échec de `sudo -n` | Vérifier les droits du compte de service `come` ; le runner ne peut pas répondre à une demande de mot de passe. |
| Échec de l’attente de santé | Lire les journaux du job et de Rallly, puis vérifier les dépendances. Le workflow ne revient pas automatiquement à l’ancienne version. |
| SSH ne répond pas | Vérifier le VPN NetBird, l’état de la VM et son adresse. |
| `pull` renvoie une erreur d’authentification | Refaire `sudo docker login ghcr.io`, vérifier l’expiration du jeton et l’accès au package. |
| Erreur de validation Compose | Vérifier les fichiers YAML et la compatibilité de Docker Compose avec `!reset` et `!override`. |
| Service `unhealthy` ou en redémarrage | Consulter `sudo ./deploy-vm.sh logs --tail=100 NOM_DU_SERVICE`. |
| Accès refusé dans Authentik | Vérifier l’appartenance au groupe `Organisateurs` et la règle liée à l’application Rallly. |
| L’interface affiche encore l’ancienne version | Vérifier que `pull` puis `up -d --no-build` ont réussi et que le service utilise l’image GHCR. |
| Disque presque plein | Examiner `df -h /` et `docker system df` avant tout nettoyage. |

## Périmètre de la CI/CD

Validé dans ce parcours : construction de l’image, publication privée sur GHCR, déploiement automatique de Rallly par le runner dédié avec attente de santé, démarrage des services et connexion SSO d’un organisateur.

Le workflow de construction/publication décrit ici n’ajoute pas de tests applicatifs ni de scan de sécurité explicites. Les autres workflows éventuellement présents dans le dépôt doivent être évalués séparément.

Le déploiement automatique concerne le service `rallly-web`. L’installation initiale, la synchronisation des fichiers Compose et du proxy, les sauvegardes, le renouvellement du jeton GHCR et les retours arrière restent des opérations administrées séparément.

La démonstration du refus d’un participant et du flux d’invitation externe reste à documenter séparément. Les interfaces de cette VM utilisent HTTP ; HTTPS reste une amélioration à prévoir.
