```
╔══════════════════════════════════════════════════════════════╗
║           GAUTHIERLELE  STREAM  COMPANION  v2.0.0            ║
║              Extension officielle pour Chrome                ║
╚══════════════════════════════════════════════════════════════╝
```

Extension navigateur non-officielle dédiée au stream Twitch de **Gauthierlele**.
Elle surveille le stream en arrière-plan, automatise certaines actions sur Twitch
et affiche les statistiques Faceit CS2 en temps réel directement dans la popup.

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Installation](#installation)
- [Structure du projet](#structure-du-projet)
- [Configuration](#configuration)
- [Permissions](#permissions)
- [Développement](#développement)
- [Crédits](#crédits)

---

## Fonctionnalités

```
┌─────────────────────────────────────────────────────────────┐
│  ▸ Surveillance du stream          ▸ Auto-pari predictions  │
│  ▸ Auto-claim points de chaîne     ▸ Stats Faceit CS2       │
│  ▸ Notifications de démarrage      ▸ Badge chat lvl 20      │
│  ▸ Ouverture automatique d'onglet  ▸ ELO de session         │
└─────────────────────────────────────────────────────────────┘
```

### Surveillance du stream

L'extension interroge l'API Twitch toutes les minutes. Quand Gauthierlele
passe en live, l'icône de l'extension se met à trembler avec un badge rouge
**LIVE**. Si un onglet Twitch est déjà ouvert, le badge bascule en **▶** violet.

### Auto-claim des points de chaîne

Un observateur surveille le DOM de Twitch et clique automatiquement sur le
bouton de collecte des points bonus dès qu'il apparaît. Activable ou
désactivable depuis la popup.

### Notifications et ouverture d'onglet

Au démarrage du stream, l'extension peut envoyer une notification système et
ouvrir automatiquement un onglet Twitch si aucun n'est déjà actif. Les deux
comportements sont configurables indépendamment.

### Auto-pari sur les prédictions _(BETA)_

Surveille l'apparition d'un panneau de prédiction sur la page Twitch, analyse
les deux options (total de points misés ou multiplicateur affiché), sélectionne
automatiquement l'option à plus longue cote, puis place la mise configurée
10 secondes avant la fermeture du vote. Un filtre de cote minimale est
disponible (`0` = toujours parier sur l'option la moins populaire).

### Statistiques Faceit CS2

Charge au démarrage de la popup les données suivantes pour le joueur
**EXT1NCTI0N-** via l'API publique Faceit :

```
  ELO · Moyenne de kills · K/D ratio · Win rate
  5 dernières parties (W / L) · Salle de match en cours
  Delta ELO de session (réinitialisable)
```

### Badge Faceit dans le chat

Injecte localement un badge Faceit niveau 20 sur chaque message visible dans
le chat Twitch. Purement cosmétique, uniquement visible pour l'utilisateur.

---

## Installation

L'extension n'est pas publiée sur le Chrome Web Store. Elle s'installe
manuellement en mode développeur.

```
1. Télécharger ou cloner ce dépôt
2. Ouvrir Chrome et naviguer vers  chrome://extensions
3. Activer le "Mode développeur" (interrupteur en haut à droite)
4. Cliquer sur "Charger l'extension non empaquetée"
5. Sélectionner le dossier racine du projet
```

L'icône apparaît alors dans la barre d'outils Chrome. Épinglez-la pour
accéder rapidement à la popup.

---

## Structure du projet

```
Gauthierlele-Extension/
│
├── manifest.json          Configuration de l'extension (MV3)
├── background.js          Service worker : polling, icône, alarmes
├── content.js             Script injecté sur twitch.tv : claim, bet, badge
├── popup.html             Interface de la popup
├── popup.js               Logique de la popup
├── popup.css              Styles de la popup
│
└── icons/
    ├── icon16.png         Icône standard  16×16
    ├── icon32.png         Icône standard  32×32
    ├── icon48.png         Icône standard  48×48
    ├── icon128.png        Icône standard 128×128
    ├── icon_shake1.png    }
    ├── icon_shake2.png    } Frames d'animation "shake" (stream live)
    ├── icon_shake3.png    }
    ├── icon_shake4.png    }
    ├── badge_f20.png      Badge Faceit lvl20 injecté dans le chat
    ├── badge_f20@2x.png   Variante haute résolution du badge
    └── CSGOSKINS.png      Logo partenaire CSGOSKINS.GG
```

---

## Configuration

Toutes les préférences sont stockées via `chrome.storage.local` et persistent
entre les sessions. Elles sont accessibles depuis la popup.

| Clé               | Type    | Défaut  | Description                                   |
|-------------------|---------|---------|-----------------------------------------------|
| `autoClaimPoints` | boolean | `true`  | Active le claim automatique des points         |
| `autoOpenTab`     | boolean | `false` | Ouvre un onglet Twitch au démarrage du stream  |
| `notifyOnStart`   | boolean | `true`  | Envoie une notification au démarrage du stream |
| `autoBet`         | boolean | `false` | Active l'auto-pari sur les prédictions         |
| `betAmount`       | number  | `50`    | Mise en points par prédiction                  |
| `targetOdds`      | number  | `0`     | Cote minimale pour parier (0 = aucun filtre)   |

---

## Permissions

```
  tabs          ── Détection des onglets Twitch ouverts
  notifications ── Notifications système au démarrage du stream
  storage       ── Persistance des préférences utilisateur
  scripting     ── Injection du content script
  alarms        ── Polling toutes les 60 secondes
  activeTab     ── Accès à l'onglet actif pour les actions Twitch
```

Hôtes autorisés : `twitch.tv`, `gql.twitch.tv`, `api.faceit.com`, `open.faceit.com`

---

## Développement

### Prérequis

Aucune dépendance externe ni étape de build. L'extension est en JavaScript
vanilla avec l'API Chrome Manifest V3.

### Rechargement après modification

Après toute modification d'un fichier source, rechargez l'extension depuis
`chrome://extensions` (bouton de rechargement sur la carte de l'extension).
Les changements dans `content.js` nécessitent en plus de rafraîchir les
onglets Twitch concernés.

### Notes sur l'API Faceit

Les appels Faceit sont effectués depuis le service worker (`background.js`)
afin de contourner les restrictions CORS du contexte popup. La popup envoie
un message de type `FACEIT_FETCH` au background, qui exécute la requête et
renvoie le résultat.

---

## Crédits

```
  Développé par  Sacripant
  Pour le stream Gauthierlele  ──  twitch.tv/Gauthierlele
  Partenaire     CSGOSKINS.GG  ──  code GOAT
```
