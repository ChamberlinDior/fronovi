# Analyse backend → décisions front driver

## 1. Configuration globale

### `application.yml`
- port backend: `8080`
- context path: `/api/v1`
- donc toutes les routes doivent être préfixées par `http://<ip>:8080/api/v1`
- pour ton iPhone Expo Go local, l’IP cohérente est `192.168.1.125`, pas `172.18.208.1`

### `SecurityConfig.java`
- endpoints publics: `/auth/**`, swagger, docs, health
- `/driver/**` réservé à `ROLE_DRIVER`
- `/rides/**`, `/wallet/**`, `/qr/**` demandent un JWT valide
- CORS ouvert, donc Expo Go local peut appeler le backend

## 2. Authentification

### `AuthController.java`
Routes disponibles:
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`

### `RegisterRequest.java`
Champs obligatoires:
- `firstName`
- `lastName`
- `phoneNumber`
- `password`
- `role`

Champs optionnels:
- `email`

Décision front:
- écran d’inscription chauffeur avec `role: DRIVER`
- validation côté backend laissée en source de vérité

### `LoginRequest.java`
Champs:
- `identifier`
- `password`
- `deviceInfo`

Décision front:
- login par email ou téléphone
- `deviceInfo` envoyé depuis l’app

### `AuthResponse.java`
Retour:
- `accessToken`
- `refreshToken`
- `tokenType`
- `expiresIn`
- `user`

Décision front:
- stockage local de session
- refresh token automatique sur 401

## 3. Module chauffeur

### `DriverController.java`
Routes réelles:
- `GET /driver/profile`
- `PATCH /driver/online`
- `PATCH /driver/offline`
- `PATCH /driver/location`
- `POST /driver/sos`

### `DriverLocationRequest.java`
Champs:
- `latitude`
- `longitude`

Décision front:
- formulaire GPS manuel
- mode auto GPS avec `expo-location`

### `SosAlertRequest.java`
Champs:
- `latitude`
- `longitude`
- `description`
- `rideId` optionnel

Décision front:
- bouton SOS avec description
- envoi des dernières coordonnées connues

### `DriverProfile.java`
Informations exposées utiles:
- `licenseNumber`
- `licenseExpiryDate`
- `nationalId`
- `status`
- `currentLatitude`
- `currentLongitude`
- `rating`
- `totalRides`
- `totalEarnings`
- `verified`
- `currentVehicle`

Décision front:
- page Profil
- dashboard avec KPIs
- affichage véhicule courant

## 4. Courses

### `RideController.java`
Routes utiles chauffeur:
- `GET /rides/{rideId}`
- `GET /rides/driver/my`
- `POST /rides/{rideId}/accept`
- `PATCH /rides/{rideId}/status?status=...`
- `POST /rides/{rideId}/cancel`
- `POST /rides/{rideId}/rate`

### `RideService.java`
Workflow réel backend:
- `REQUESTED -> DRIVER_ASSIGNED`
- `DRIVER_ASSIGNED -> DRIVER_EN_ROUTE`
- `DRIVER_EN_ROUTE -> DRIVER_ARRIVED`
- `DRIVER_ARRIVED -> IN_PROGRESS`
- `IN_PROGRESS -> COMPLETED`
- `COMPLETED -> PAID`

Décision front:
- boutons contextuels de progression strictement basés sur cette machine d’état
- pas d’invention d’autre flux

### Limitation backend constatée
Le service possède `getAvailableRides(...)` mais il n’existe **pas** de route controller associée.

Conséquence:
- impossible de faire une liste “courses disponibles” proprement depuis le front sans ajouter une API backend
- le front livré utilise donc:
  - historique chauffeur
  - chargement d’une course par UUID
  - acceptation si cette course est encore `REQUESTED`

## 5. QR de paiement

### `QrCodeController.java`
Routes utiles:
- `POST /qr/generate/{rideId}`
- `GET /qr/ride/{rideId}`

### `QrCodeService.java`
Règles métier:
- le QR n’est générable que si la course est `COMPLETED`
- un QR actif unique par course
- le QR contient base64 PNG

Décision front:
- bouton “Générer QR” uniquement sur les courses `COMPLETED`
- modal affichant l’image base64, le token, le montant, l’expiration

## 6. Wallet

### `WalletController.java`
Routes utiles:
- `GET /wallet`
- `POST /wallet/recharge`
- `GET /wallet/transactions`

### `WalletRechargeRequest.java`
Champs:
- `amount`
- `provider`
- `mobileMoneyNumber`
- `externalReference`

Décision front:
- écran Wallet avec recharge Mobile Money
- historique des transactions
- solde en XAF

## 7. Ce que le front livré couvre exactement

### Couvert
- auth complète
- profil chauffeur
- statut online/offline
- GPS manuel et automatique
- SOS
- historique chauffeur
- recherche de course par UUID
- acceptation de course
- progression complète de statut
- annulation
- QR de paiement
- wallet + transactions + recharge
- base URL locale modifiable

### Non couvert volontairement car backend non exposé
- liste publique des courses disponibles pour chauffeur
- dispatch temps réel websocket
- carte native/itinéraire temps réel
- upload de documents chauffeur
- notes détaillées côté review chauffeur si UI dédiée voulue

## 8. Recommandation backend pour version 2

Pour rendre le front driver complet façon Uber/Heetch côté dispatch, ajoute au minimum:
- `GET /driver/rides/available`
- `GET /driver/rides/active`
- `PATCH /driver/rides/{rideId}/arrived`
- `PATCH /driver/rides/{rideId}/start`
- `PATCH /driver/rides/{rideId}/complete`
- websocket ou SSE pour nouvelles demandes
- endpoint direction/ETA si tu veux la vraie logique carte
