# Alerte A1 : Gonesse → Creil

Notification sur iPhone (appli ntfy) **uniquement quand l'A1 est fermée** entre l'échangeur A104 (Gonesse) et la sortie 9, avec la portion fermée et le sens. Une notification arrive aussi quand elle rouvre.

- Vérification toutes les 5 minutes par GitHub Actions (`.github/workflows/a1.yml`).
- Source : TomTom Traffic (données officielles Sanef, DIRIF, Bison Futé et signalements conducteurs).
- Zone surveillée : ligne `bbox` dans `check-a1.mjs`.

## Ajouter un ami

1. Installer **ntfy** depuis l'App Store.
2. Appuyer sur **+** et saisir le nom du canal (demander à Mohsan).
3. Dans Réglages iPhone → Notifications → ntfy, activer **Notifications urgentes**.

## Tester

Onglet **Actions** → **Surveillance A1** → **Run workflow** → cocher **Envoyer une notification de test**.
