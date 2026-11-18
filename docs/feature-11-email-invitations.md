# Feature 11 : invitations nominatives par e-mail

## Objectif et périmètre

Permettre à l'organisateur d'un sondage d'inviter personnellement un destinataire
depuis la fenêtre **Partager**, avec son prénom et un message facultatif.

La version de Rallly utilisée proposait déjà l'envoi d'une invitation à une adresse
e-mail, un lien individuel et le suivi des invitations. Notre variante ajoute :

- un prénom obligatoire de 1 à 100 caractères ;
- un message facultatif de 1 000 caractères maximum ;
- une salutation nominative et le message dans l'e-mail ;
- des erreurs de validation dans le formulaire, en français et en anglais ;
- la conservation de la saisie en cas d'échec et le blocage d'un nouvel envoi
  pendant le traitement.

Le prénom et le message servent uniquement à composer l'e-mail. Ils ne sont pas
stockés dans la base et ne changent pas l'identité utilisée lors du vote. Le lien
individuel existant continue de fonctionner. Aucune migration n'est nécessaire.

## Démonstration locale

1. Démarrer les services de `docker-compose.dev.yml` et l'application web avec
   la configuration locale (`NEXT_PUBLIC_SELF_HOSTED=true` et SMTP Mailpit sur
   `localhost:1025`).
2. Se connecter avec un compte organisateur et créer un sondage.
3. Ouvrir **Partager**, saisir le prénom « Alice », l'adresse
   `alice@example.com` et un message personnalisé sur plusieurs lignes.
4. Cliquer sur **Envoyer l'invitation** (le libellé dépend de la langue).
5. Dans Mailpit, à <http://localhost:8025>, ouvrir l'e-mail reçu par Alice.
   Vérifier la salutation, le message, le titre du sondage et le bouton de réponse.
6. Ouvrir le lien dans une fenêtre privée et vérifier que le bon sondage s'affiche.
7. Vérifier qu'un prénom vide ou une adresse invalide bloque l'envoi. Une nouvelle
   invitation à la même adresse sur le même sondage reste refusée.

Pour la soutenance, ajouter les captures du formulaire rempli et de l'e-mail reçu.
L'invitation à voter ne crée pas de compte Authentik : l'invitation externe de
l'infrastructure SSO reste un autre livrable du TP.

## Validation

Avec Node 24 et pnpm installés, depuis la racine :

```sh
pnpm --filter @rallly/web exec vitest run src/features/poll/invite/schema.test.ts
pnpm --filter @rallly/emails exec vitest run src/templates/poll-invite.test.tsx
pnpm --filter @rallly/web type-check
pnpm --filter @rallly/emails type-check
```

Les scénarios d'intégration `apps/web/tests/email-invites.spec.ts` et
`apps/web/tests/personalized-email-invites.spec.ts` vérifient également la réception
du prénom et du message via le serveur SMTP de laboratoire. Le second couvre aussi
les champs invalides, le cas sans message et l'ouverture du lien en fenêtre privée.
