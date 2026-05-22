# 🎮 Gauthierlele Stream Companion — Extension Chrome

Extension officielle pour accompagner le stream de **Gauthierlele** sur Twitch.  
Développée par **Sacripant**.

---

## ✅ Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| 🔴 Statut du stream | Affiche si Gauthierlele est LIVE ou OFFLINE |
| 🎯 Auto-claim points | Réclame automatiquement les points de chaîne (toggle) |
| 🔔 Notification | Alerte quand le stream démarre (toggle) |
| 🗂️ Auto-open tab | Ouvre automatiquement Twitch au démarrage (toggle) |
| 💜 Icône animée | L'icône tremble quand le stream est live mais sans onglet ouvert |
| 🎮 Stats Faceit | ELO, kills moyens, K/D, winrate, salle en cours |
| 📊 Session ELO | Gains/pertes d'ELO depuis le début de la session |
| 🏆 Streak | 5 dernières parties (W/L) |
| 🔗 Réseaux sociaux | Liens X, YouTube, TikTok, Discord, Faceit, HLTV |
| 💸 Donation | Bouton de don direct vers Streamlabs |
| 🤝 Partenaires | Section dédiée (à compléter) |

---

## 📦 Installation

> **Aucune publication sur le Chrome Web Store** — installation manuelle.

1. Téléchargez et décompressez le fichier ZIP
2. Ouvrez Chrome et allez sur `chrome://extensions/`
3. Activez le **Mode développeur** (coin supérieur droit)
4. Cliquez sur **Charger l'extension non empaquetée**
5. Sélectionnez le dossier `gauthierlele-extension`
6. L'icône apparaît dans la barre d'outils ✅

---

## 🎮 Stats Faceit

Les stats Faceit nécessitent une **clé API Faceit** (gratuite) :

1. Allez sur [developers.faceit.com](https://developers.faceit.com/)
2. Créez un compte et générez une clé API
3. Collez-la dans la popup au premier lancement

> La clé est stockée localement dans l'extension — elle n'est jamais envoyée ailleurs que vers l'API officielle Faceit.

---

## 🔧 Développement

```
gauthierlele-extension/
├── manifest.json       # Config Chrome Extension (MV3)
├── background.js       # Service worker (polling, notifications, icône)
├── content.js          # Script sur twitch.tv (auto-claim)
├── popup.html          # Interface utilisateur
├── popup.css           # Styles (thème Twitch)
├── popup.js            # Logique popup + Faceit API
└── icons/              # Icônes (16, 32, 48, 128px)
```

---

## ⚙️ Notes techniques

- **Manifest V3** (standard Chrome moderne)
- L'icône tremble toutes les 150ms via `OffscreenCanvas` quand le stream est live sans onglet ouvert
- Les points de chaîne sont détectés via `MutationObserver` sur la page Twitch
- Le stream est vérifié toutes les **60 secondes** via l'API GQL de Twitch

---

## 🤝 Partenaires

Aucun partenaire pour le moment — section à compléter dans `popup.html`.

---

*Fait avec 💜 par **Sacripant***
