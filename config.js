/* ==========================================================
   PORTAIL DOCUMENTAIRE RRM
   CONFIGURATION GENERALE
   ========================================================== */

/*
 * Remplacez uniquement :
 *
 * 1. SUPABASE_URL
 * 2. SUPABASE_PUBLISHABLE_KEY
 *
 * Ne placez jamais dans ce fichier :
 *
 * - une Secret key ;
 * - une clé service_role ;
 * - le mot de passe administrateur ;
 * - une information confidentielle.
 */

const SUPABASE_URL =
  "https://qzbuifjvdcypexoxnprc.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_EF2NY3E1Z_y0zMrRttcOiw_9_XsV5R1";

/* ==========================================================
   VALIDATION DE LA CONFIGURATION
   ========================================================== */

function validateConfiguration() {
  const errors = [];

  if (
    !SUPABASE_URL ||
    SUPABASE_URL.includes(
      "VOTRE-PROJET"
    )
  ) {
    errors.push(
      "L’URL Supabase n’a pas été configurée."
    );
  }

  if (
    !SUPABASE_URL.startsWith(
      "https://"
    )
  ) {
    errors.push(
      "L’URL Supabase doit commencer par https://."
    );
  }

  if (
    !SUPABASE_URL.endsWith(
      ".supabase.co"
    )
  ) {
    console.warn(
      "L’URL Supabase ne se termine pas par .supabase.co. Vérifiez qu’il ne s’agit pas d’une erreur ou d’un domaine personnalisé."
    );
  }

  if (
    !SUPABASE_PUBLISHABLE_KEY ||
    SUPABASE_PUBLISHABLE_KEY.includes(
      "VOTRE_CLE_PUBLIQUE"
    )
  ) {
    errors.push(
      "La clé publique Supabase n’a pas été configurée."
    );
  }

  if (
    SUPABASE_PUBLISHABLE_KEY.startsWith(
      "sb_secret_"
    )
  ) {
    errors.push(
      "Une Secret key ne doit jamais être utilisée dans config.js."
    );
  }

  if (
    SUPABASE_PUBLISHABLE_KEY.toLowerCase()
      .includes("service_role")
  ) {
    errors.push(
      "La clé service_role ne doit jamais être utilisée dans le navigateur."
    );
  }

  if (errors.length > 0) {
    console.error(
      "Configuration invalide du portail :",
      errors
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/* ==========================================================
   CONFIGURATION EXPORTEE VERS APP.JS
   ========================================================== */

export const CONFIG = Object.freeze({
  /*
   * URL du projet Supabase.
   *
   * Exemple :
   * https://abcdefghijk.supabase.co
   */
  SUPABASE_URL,

  /*
   * Clé publique utilisée par le navigateur.
   *
   * Format recommandé :
   * sb_publishable_xxxxxxxxx
   *
   * Une ancienne clé anon peut fonctionner, mais la clé
   * publishable est recommandée pour les nouveaux projets.
   */
  SUPABASE_PUBLISHABLE_KEY,

  /*
   * Nom exact du bucket créé dans Supabase Storage.
   */
  STORAGE_BUCKET:
    "documents",

  /*
   * Taille maximale autorisée :
   * 20 Mo.
   */
  MAX_FILE_SIZE:
    20 * 1024 * 1024,

  /*
   * Formats autorisés pour les documents.
   */
  ALLOWED_MIME_TYPES: [
    "application/pdf",
  ],

  /*
   * Extension attendue.
   */
  ALLOWED_FILE_EXTENSIONS: [
    "pdf",
  ],

  /*
   * Statut appliqué lors d’une publication publique.
   */
  DEFAULT_PUBLICATION_STATUS:
    "published",

  /*
   * Schéma PostgreSQL utilisé.
   */
  DATABASE_SCHEMA:
    "public",

  /*
   * Nom du portail.
   */
  APPLICATION_NAME:
    "Portail documentaire RRM",

  /*
   * Version du portail.
   */
  APPLICATION_VERSION:
    "1.0.0",

  /*
   * Langue principale.
   */
  LOCALE:
    "fr-FR",

  /*
   * Nombre maximal de documents affichés.
   * La valeur 500 peut être augmentée ultérieurement
   * en ajoutant une pagination.
   */
  MAX_DOCUMENTS_PER_REQUEST:
    500,

  /*
   * Durée du cache Storage en secondes.
   */
  STORAGE_CACHE_CONTROL:
    "3600",

  /*
   * Configuration de l’authentification administrateur.
   */
  AUTH: Object.freeze({
    PERSIST_SESSION:
      true,

    AUTO_REFRESH_TOKEN:
      true,

    DETECT_SESSION_IN_URL:
      true,
  }),

  /*
   * Messages généraux réutilisables.
   */
  MESSAGES: Object.freeze({
    CONFIGURATION_ERROR:
      "La configuration Supabase du portail est incomplète.",

    NETWORK_ERROR:
      "La connexion au serveur est momentanément indisponible.",

    UNAUTHORIZED:
      "Vous ne disposez pas des droits nécessaires pour effectuer cette opération.",

    ADMIN_REQUIRED:
      "Une connexion administrateur est requise.",

    INVALID_PDF:
      "Seuls les fichiers PDF sont autorisés.",

    FILE_TOO_LARGE:
      "La taille maximale autorisée est de 20 Mo.",
  }),
});

/* ==========================================================
   RESULTAT DE LA VALIDATION
   ========================================================== */

export const CONFIG_STATUS =
  validateConfiguration();
