# CI et déploiement de Rallly sur la VM

Ce guide décrit la configuration mise en place et validée le 18 novembre 2026.

## Fonctionnement

1. Une modification est fusionnée ou poussée sur `main`.
2. GitHub Actions construit l’image personnalisée de Rallly depuis le dépôt.
3. Si la construction réussit, le workflow publie l’image privée sur GHCR.
4. Un opérateur télécharge l’image sur la VM et recrée le conteneur Rallly.

La construction et la publication sont automatiques. Le déploiement sur la VM reste manuel.

Les pull requests déclenchent également une construction, sans publication de l’image.

## Ressources et preuves

- Dépôt : https://github.com/Ynov-projects-CYCA/RalllyDevDocker
- Workflow : `.github/workflows/docker-image.yml`
- Historique des exécutions : https://github.com/Ynov-projects-CYCA/RalllyDevDocker/actions/workflows/docker-image.yml
- Image : `ghcr.io/ynov-projects-cyca/ralllydevdocker:latest`
- Tags publiés : `latest` et le SHA complet du commit.
- Construction : `apps/web/Dockerfile`, plateforme `linux/amd64`, argument `SELF_HOSTED=true`.

Le 18 novembre 2026, une exécution verte sur `main`, pour le commit commençant par `550a704`, a été constatée. L’image publiée a ensuite été téléchargée et utilisée sur la VM. Les contrôles de santé des services étaient au vert et la connexion Authentik vers Rallly a été testée avec succès après ajout du compte au groupe `Organisateurs`.

Pour la soutenance, conserver le lien permanent de cette exécution et les captures de la pipeline, du package et des services déployés.

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

Attendre que l’exécution du workflow sur `main` soit verte avant de télécharger la nouvelle image.

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
sudo ./deploy-vm.sh up -d --no-build rallly-web
```

Compose recrée le conteneur si l’image a changé. Les volumes persistants existants sont conservés. Le démarrage peut appliquer des migrations de base de données : prévoir une sauvegarde avant une mise à jour importante.

`latest` est un tag modifiable. Pour identifier précisément une version déployée, relever son digest et le commit du workflow. Il est également possible de remplacer `latest` dans la configuration par le tag SHA d’un commit publié.

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

Ne pas utiliser `down -v` pour un simple arrêt : cette option supprime les volumes gérés par Compose et peut entraîner la perte des bases de données.

## Dépannage courant

| Problème | Vérification |
|---|---|
| SSH ne répond pas | Vérifier le VPN NetBird, l’état de la VM et son adresse. |
| `pull` renvoie une erreur d’authentification | Refaire `sudo docker login ghcr.io`, vérifier l’expiration du jeton et l’accès au package. |
| Erreur de validation Compose | Vérifier les fichiers YAML et la compatibilité de Docker Compose avec `!reset` et `!override`. |
| Service `unhealthy` ou en redémarrage | Consulter `sudo ./deploy-vm.sh logs --tail=100 NOM_DU_SERVICE`. |
| Accès refusé dans Authentik | Vérifier l’appartenance au groupe `Organisateurs` et la règle liée à l’application Rallly. |
| L’interface affiche encore l’ancienne version | Vérifier que `pull` puis `up -d --no-build` ont réussi et que le service utilise l’image GHCR. |
| Disque presque plein | Examiner `df -h /` et `docker system df` avant tout nettoyage. |

## Périmètre de la CI/CD

Validé dans ce parcours : construction de l’image, publication privée sur GHCR, téléchargement sur la VM, démarrage des services et connexion SSO d’un organisateur.

Le workflow de construction/publication décrit ici n’ajoute pas de tests applicatifs ni de scan de sécurité explicites. Les autres workflows éventuellement présents dans le dépôt doivent être évalués séparément.

Le déploiement automatique depuis GitHub n’est pas configuré. La VM étant sur un réseau privé, une future automatisation doit prévoir un accès réseau approprié, par exemple un runner dédié ou une connexion NetBird configurée pour le déploiement.

La démonstration du refus d’un participant et du flux d’invitation externe reste à documenter séparément. Les interfaces de cette VM utilisent HTTP ; HTTPS reste une amélioration à prévoir.
