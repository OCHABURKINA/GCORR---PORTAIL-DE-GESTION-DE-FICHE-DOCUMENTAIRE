import {
  createClient,
} from "https://esm.sh/@supabase/supabase-js@2";

import {
  CONFIG,
} from "./config.js";

/* ==========================================================
   1. INITIALISATION DU CLIENT SUPABASE
   ========================================================== */

const supabase = createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession:
        CONFIG.AUTH?.PERSIST_SESSION ??
        true,

      autoRefreshToken:
        CONFIG.AUTH?.AUTO_REFRESH_TOKEN ??
        true,

      detectSessionInUrl:
        CONFIG.AUTH?.DETECT_SESSION_IN_URL ??
        true,
    },
  }
);

/* ==========================================================
   2. ÉTAT GLOBAL DE L’APPLICATION
   ========================================================== */

const state = {
  session: null,
  isAdmin: false,
  adminProfile: null,

  organizations: [],
  alerts: [],
  alertCommuneOptions: [],
  documents: [],

  adminOrganizations: [],
  adminAlerts: [],
  adminAlertCommunes: [],

  selectedPublishAlert: null,
  selectedPublishCommune: null,

  initialized: false,
  eventsInitialized: false,
  authenticationListenerInitialized: false,

  organizationImportInProgress: false,
  alertImportInProgress: false,
  documentPublicationInProgress: false,
};

/* ==========================================================
   3. OUTILS DOM
   ========================================================== */

function getElement(id) {
  return document.getElementById(id);
}

function getElements(selector) {
  return Array.from(
    document.querySelectorAll(selector)
  );
}

function elementExists(id) {
  return Boolean(
    getElement(id)
  );
}

/* ==========================================================
   4. SÉCURISATION DES CONTENUS HTML
   ========================================================== */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ==========================================================
   5. NORMALISATION DES TEXTES
   ========================================================== */

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeHeader(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .trim()
    .toLowerCase()
    .replace(/[\s\-./]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeAlertCodeKey(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function normalizeRegionKey(value) {
  return normalizeText(value);
}

function normalizeCommuneKey(value) {
  return normalizeText(value);
}

function normalizeOrganizationKey(value) {
  return normalizeText(value);
}

function slugify(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ==========================================================
   6. GÉNÉRATION D’UN IDENTIFIANT LOCAL
   ========================================================== */

function generateUniqueId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID ===
      "function"
  ) {
    return crypto.randomUUID();
  }

  return [
    Date.now(),
    Math.random()
      .toString(36)
      .slice(2),
  ].join("-");
}

/* ==========================================================
   7. OUTILS POUR LES FICHIERS
   ========================================================== */

function sanitizeFileName(fileName) {
  const originalName =
    String(
      fileName ||
      "document.pdf"
    );

  const lastDotIndex =
    originalName.lastIndexOf(".");

  const extension =
    lastDotIndex >= 0
      ? originalName
          .slice(lastDotIndex)
          .toLowerCase()
      : ".pdf";

  const baseName =
    lastDotIndex >= 0
      ? originalName.slice(
          0,
          lastDotIndex
        )
      : originalName;

  const safeBaseName =
    slugify(baseName) ||
    "document";

  return `${safeBaseName}${extension}`;
}

function formatFileSize(bytes) {
  const numericValue =
    Number(bytes) || 0;

  if (numericValue <= 0) {
    return "0 octet";
  }

  const units = [
    "octets",
    "Ko",
    "Mo",
    "Go",
  ];

  let value =
    numericValue;

  let unitIndex = 0;

  while (
    value >= 1024 &&
    unitIndex <
      units.length - 1
  ) {
    value /= 1024;
    unitIndex += 1;
  }

  const decimals =
    unitIndex === 0
      ? 0
      : 1;

  return `${value.toFixed(
    decimals
  )} ${units[unitIndex]}`;
}

function validatePdf(file) {
  if (!file) {
    throw new Error(
      "Veuillez sélectionner un fichier PDF."
    );
  }

  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase();

  const validMimeType =
    file.type ===
    "application/pdf";

  const validExtension =
    extension === "pdf";

  if (
    !validMimeType &&
    !validExtension
  ) {
    throw new Error(
      "Seuls les fichiers PDF sont autorisés."
    );
  }

  if (file.size <= 0) {
    throw new Error(
      "Le fichier sélectionné est vide."
    );
  }

  const maximumFileSize =
    Number(
      CONFIG.MAX_FILE_SIZE
    );

  if (
    Number.isFinite(
      maximumFileSize
    ) &&
    maximumFileSize > 0 &&
    file.size >
      maximumFileSize
  ) {
    throw new Error(
      CONFIG.MESSAGES
        ?.FILE_TOO_LARGE ||
      "La taille maximale autorisée est dépassée."
    );
  }
}

function validateCsvFile(file) {
  if (!file) {
    throw new Error(
      "Veuillez sélectionner un fichier CSV."
    );
  }

  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase();

  const acceptedExtensions = [
    "csv",
    "txt",
  ];

  const acceptedMimeTypes = [
    "text/csv",
    "text/plain",
    "application/csv",
    "application/vnd.ms-excel",
    "application/octet-stream",
    "",
  ];

  if (
    !acceptedExtensions.includes(
      extension
    ) &&
    !acceptedMimeTypes.includes(
      file.type
    )
  ) {
    throw new Error(
      "Le fichier sélectionné doit être au format CSV ou TXT."
    );
  }

  if (file.size <= 0) {
    throw new Error(
      "Le fichier CSV sélectionné est vide."
    );
  }
}

/* ==========================================================
   8. FORMATAGE DES DATES
   ========================================================== */

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    CONFIG.LOCALE ||
    "fr-FR",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(date);
}

/* ==========================================================
   9. AFFICHAGE DES MESSAGES
   ========================================================== */

function showMessage(
  element,
  message,
  type = "success"
) {
  if (!element) {
    return;
  }

  element.textContent =
    String(message || "");

  element.className =
    `message message-${type}`;

  element.classList.remove(
    "hidden"
  );

  element.setAttribute(
    "aria-live",
    type === "error"
      ? "assertive"
      : "polite"
  );
}

function hideMessage(element) {
  if (!element) {
    return;
  }

  element.textContent = "";

  element.className =
    "message hidden";
}

function getErrorMessage(
  error,
  fallbackMessage
) {
  if (
    typeof error === "string"
  ) {
    return error;
  }

  if (
    error?.message
  ) {
    return error.message;
  }

  if (
    error?.error_description
  ) {
    return error.error_description;
  }

  return fallbackMessage;
}

/* ==========================================================
   10. GESTION DES BOUTONS EN COURS DE TRAITEMENT
   ========================================================== */

function setButtonLoading(
  button,
  isLoading,
  loadingText = "Traitement..."
) {
  if (!button) {
    return;
  }

  if (isLoading) {
    if (
      !button.dataset
        .originalText
    ) {
      button.dataset
        .originalText =
        button.textContent.trim();
    }

    button.disabled = true;

    button.textContent =
      loadingText;

    button.setAttribute(
      "aria-busy",
      "true"
    );

    return;
  }

  button.disabled = false;

  button.textContent =
    button.dataset
      .originalText ||
    button.textContent;

  button.removeAttribute(
    "aria-busy"
  );
}

/* ==========================================================
   11. OUTILS POUR LES COLLECTIONS
   ========================================================== */

function uniqueValues(values) {
  const valuesMap =
    new Map();

  values
    .map(
      (value) =>
        String(
          value ?? ""
        ).trim()
    )
    .filter(Boolean)
    .forEach(
      (value) => {
        const key =
          normalizeText(value);

        if (
          !valuesMap.has(
            key
          )
        ) {
          valuesMap.set(
            key,
            value
          );
        }
      }
    );

  return [
    ...valuesMap.values(),
  ].sort(
    (a, b) =>
      a.localeCompare(
        b,
        "fr",
        {
          sensitivity:
            "base",
        }
      )
  );
}

function chunkArray(
  values,
  chunkSize = 100
) {
  const chunks = [];

  for (
    let index = 0;
    index < values.length;
    index += chunkSize
  ) {
    chunks.push(
      values.slice(
        index,
        index + chunkSize
      )
    );
  }

  return chunks;
}

/* ==========================================================
   12. URL PUBLIQUE SUPABASE STORAGE
   ========================================================== */

function getPublicUrl(
  storagePath
) {
  if (!storagePath) {
    return "";
  }

  const {
    data,
  } = supabase.storage
    .from(
      CONFIG.STORAGE_BUCKET
    )
    .getPublicUrl(
      storagePath
    );

  return data?.publicUrl || "";
}

/* ==========================================================
   13. RECHERCHE DANS L’ÉTAT GLOBAL
   ========================================================== */

function getOrganizationById(
  organizationId
) {
  if (!organizationId) {
    return null;
  }

  return (
    state.organizations.find(
      (item) =>
        item.id ===
        organizationId
    ) ||
    state.adminOrganizations.find(
      (item) =>
        item.id ===
        organizationId
    ) ||
    null
  );
}

function getAlertById(alertId) {
  if (!alertId) {
    return null;
  }

  return (
    state.alerts.find(
      (item) =>
        item.id ===
        alertId
    ) ||
    state.adminAlerts.find(
      (item) =>
        item.id ===
        alertId
    ) ||
    null
  );
}

function getAlertCommuneById(
  alertCommuneId
) {
  if (!alertCommuneId) {
    return null;
  }

  const publicOption =
    state.alertCommuneOptions.find(
      (item) =>
        item.alert_commune_id ===
        alertCommuneId
    );

  if (publicOption) {
    return publicOption;
  }

  const adminCommune =
    state.adminAlertCommunes.find(
      (item) =>
        item.id ===
        alertCommuneId
    );

  if (!adminCommune) {
    return null;
  }

  const relatedAlert =
    getAlertById(
      adminCommune.alert_id
    );

  return {
    ...adminCommune,

    alert_commune_id:
      adminCommune.id,

    alert_code:
      relatedAlert?.alert_code ||
      "",

    region:
      relatedAlert?.region ||
      "",

    alert_is_active:
      relatedAlert?.is_active ??
      true,

    alert_commune_is_active:
      adminCommune.is_active ??
      true,
  };
}

function getAlertCommunes(
  alertId,
  activeOnly = true
) {
  return state
    .alertCommuneOptions
    .filter(
      (item) => {
        if (
          item.alert_id !==
          alertId
        ) {
          return false;
        }

        if (!activeOnly) {
          return true;
        }

        return (
          item.alert_is_active !==
            false &&
          item
            .alert_commune_is_active !==
            false
        );
      }
    );
}

/* ==========================================================
   14. PRÉVENTION DES SOUMISSIONS NATIVES
   ========================================================== */

/**
 * Cette fonction empêche un formulaire HTML de recharger
 * la page lorsqu’un traitement est piloté par JavaScript.
 */
function preventNativeFormSubmission(
  event
) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
}
/* ==========================================================
   15. NAVIGATION PRINCIPALE
   ========================================================== */

function showView(viewName) {
  if (
    viewName === "admin" &&
    !state.isAdmin
  ) {
    openLoginModal();
    return;
  }

  const targetView =
    getElement(
      `${viewName}View`
    );

  if (!targetView) {
    console.warn(
      `Vue introuvable : ${viewName}`
    );

    return;
  }

  getElements(".view")
    .forEach(
      (view) => {
        view.classList.remove(
          "active-view"
        );
      }
    );

  targetView.classList.add(
    "active-view"
  );

  getElements(".nav-button")
    .forEach(
      (button) => {
        button.classList.toggle(
          "active",
          button.dataset.view ===
            viewName
        );
      }
    );

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });

  if (
    viewName === "documents"
  ) {
    renderDocuments();
  }

  if (
    viewName === "admin" &&
    state.isAdmin
  ) {
    loadAdminData()
      .catch(
        (error) => {
          console.error(
            "Erreur de chargement de l’administration :",
            error
          );

          showMessage(
            getElement(
              "adminGlobalMessage"
            ),
            getErrorMessage(
              error,
              "Impossible de charger les données administratives."
            ),
            "error"
          );
        }
      );
  }
}

/* ==========================================================
   16. INITIALISATION DE LA NAVIGATION
   ========================================================== */

function initializeNavigation() {
  getElements("[data-view]")
    .forEach(
      (element) => {
        element.addEventListener(
          "click",
          (event) => {
            preventNativeFormSubmission(
              event
            );

            const targetView =
              element.dataset.view;

            if (targetView) {
              showView(
                targetView
              );
            }
          }
        );
      }
    );
}

/* ==========================================================
   17. AFFICHAGE D’UN ONGLET ADMINISTRATIF
   ========================================================== */

function showAdminTab(tabName) {
  const buttons =
    getElements(
      "[data-admin-tab]"
    );

  const panels =
    getElements(
      ".admin-tab-panel"
    );

  buttons.forEach(
    (button) => {
      const active =
        button.dataset.adminTab ===
        tabName;

      button.classList.toggle(
        "active",
        active
      );

      button.setAttribute(
        "aria-selected",
        String(active)
      );

      button.tabIndex =
        active ? 0 : -1;
    }
  );

  panels.forEach(
    (panel) => {
      const active =
        panel.id ===
        `admin-${tabName}-panel`;

      panel.hidden =
        !active;

      panel.classList.toggle(
        "active",
        active
      );
    }
  );

  switch (tabName) {
    case "organizations":
      renderAdminOrganizations();
      break;

    case "alerts":
      renderAdminAlerts();
      break;

    case "documents":
      renderAdminDocuments();
      break;

    default:
      console.warn(
        `Onglet administrateur inconnu : ${tabName}`
      );
      break;
  }
}

/* ==========================================================
   18. INITIALISATION DES ONGLETS ADMINISTRATIFS
   ========================================================== */

function initializeAdminTabs() {
  getElements(
    "[data-admin-tab]"
  ).forEach(
    (button) => {
      button.addEventListener(
        "click",
        (event) => {
          preventNativeFormSubmission(
            event
          );

          const tabName =
            button.dataset.adminTab;

          if (tabName) {
            showAdminTab(
              tabName
            );
          }
        }
      );

      button.addEventListener(
        "keydown",
        (event) => {
          const tabButtons =
            getElements(
              "[data-admin-tab]"
            );

          const currentIndex =
            tabButtons.indexOf(
              button
            );

          if (
            currentIndex < 0
          ) {
            return;
          }

          let nextIndex =
            currentIndex;

          if (
            event.key ===
            "ArrowRight"
          ) {
            nextIndex =
              (
                currentIndex + 1
              ) %
              tabButtons.length;
          } else if (
            event.key ===
            "ArrowLeft"
          ) {
            nextIndex =
              (
                currentIndex -
                1 +
                tabButtons.length
              ) %
              tabButtons.length;
          } else {
            return;
          }

          event.preventDefault();

          const nextButton =
            tabButtons[nextIndex];

          nextButton?.focus();

          const nextTab =
            nextButton
              ?.dataset
              ?.adminTab;

          if (nextTab) {
            showAdminTab(
              nextTab
            );
          }
        }
      );
    }
  );

  showAdminTab(
    "organizations"
  );
}

/* ==========================================================
   19. INITIALISATION DE L’AUTHENTIFICATION
   ========================================================== */

async function initializeAuthentication() {
  const {
    data,
    error,
  } =
    await supabase.auth
      .getSession();

  if (error) {
    console.error(
      "Erreur lors de la récupération de la session :",
      error
    );
  }

  state.session =
    data?.session ||
    null;

  await checkAdminStatus();

  if (
    state.authenticationListenerInitialized
  ) {
    return;
  }

  state.authenticationListenerInitialized =
    true;

  supabase.auth.onAuthStateChange(
    async (
      _event,
      session
    ) => {
      state.session =
        session ||
        null;

      await checkAdminStatus();

      try {
        await loadDocuments();

        if (state.isAdmin) {
          await loadAdminData();
        } else {
          state.adminOrganizations = [];
          state.adminAlerts = [];
          state.adminAlertCommunes = [];
        }
      } catch (error) {
        console.error(
          "Erreur après le changement de session :",
          error
        );
      }
    }
  );
}

/* ==========================================================
   20. VÉRIFICATION DU RÔLE ADMINISTRATEUR
   ========================================================== */

async function checkAdminStatus() {
  state.isAdmin = false;
  state.adminProfile = null;

  const userId =
    state.session
      ?.user
      ?.id;

  if (!userId) {
    updateAuthenticationInterface();
    return;
  }

  const {
    data,
    error,
  } = await supabase
    .from("profiles")
    .select(`
      id,
      full_name,
      role
    `)
    .eq(
      "id",
      userId
    )
    .maybeSingle();

  if (error) {
    console.error(
      "Impossible de vérifier le profil administrateur :",
      error
    );

    updateAuthenticationInterface();
    return;
  }

  state.adminProfile =
    data ||
    null;

  state.isAdmin =
    data?.role ===
    "admin";

  updateAuthenticationInterface();
}

/* ==========================================================
   21. MISE À JOUR DE L’INTERFACE D’AUTHENTIFICATION
   ========================================================== */

function updateAuthenticationInterface() {
  const loginButton =
    getElement(
      "loginButton"
    );

  const logoutButton =
    getElement(
      "logoutButton"
    );

  getElements(
    ".admin-only"
  ).forEach(
    (element) => {
      element.classList.toggle(
        "hidden",
        !state.isAdmin
      );
    }
  );

  loginButton?.classList.toggle(
    "hidden",
    state.isAdmin
  );

  logoutButton?.classList.toggle(
    "hidden",
    !state.isAdmin
  );

  const adminIdentity =
    getElement(
      "adminIdentity"
    );

  if (adminIdentity) {
    if (state.isAdmin) {
      const identity =
        state.adminProfile
          ?.full_name ||
        state.session
          ?.user
          ?.email ||
        "Administrateur";

      adminIdentity.textContent =
        `Connecté en tant que ${identity}.`;
    } else {
      adminIdentity.textContent =
        "Gestion des organisations, des Alertes ID, des communes associées et des fiches publiées.";
    }
  }

  if (
    !state.isAdmin &&
    getElement(
      "adminView"
    )?.classList.contains(
      "active-view"
    )
  ) {
    showView(
      "home"
    );
  }
}

/* ==========================================================
   22. OUVERTURE DE LA MODALE DE CONNEXION
   ========================================================== */

function openLoginModal() {
  const modal =
    getElement(
      "loginModal"
    );

  if (!modal) {
    return;
  }

  modal.classList.remove(
    "hidden"
  );

  modal.setAttribute(
    "aria-hidden",
    "false"
  );

  document.body.classList.add(
    "modal-open"
  );

  hideMessage(
    getElement(
      "loginMessage"
    )
  );

  window.setTimeout(
    () => {
      getElement(
        "adminEmail"
      )?.focus();
    },
    100
  );
}

/* ==========================================================
   23. FERMETURE DE LA MODALE DE CONNEXION
   ========================================================== */

function closeLoginModal() {
  const modal =
    getElement(
      "loginModal"
    );

  if (!modal) {
    return;
  }

  modal.classList.add(
    "hidden"
  );

  modal.setAttribute(
    "aria-hidden",
    "true"
  );

  document.body.classList.remove(
    "modal-open"
  );

  hideMessage(
    getElement(
      "loginMessage"
    )
  );
}

/* ==========================================================
   24. CONNEXION ADMINISTRATEUR
   ========================================================== */

async function handleAdminLogin(
  event
) {
  preventNativeFormSubmission(
    event
  );

  const submitButton =
    event?.submitter ||
    event?.currentTarget
      ?.querySelector(
        'button[type="submit"]'
      );

  const messageElement =
    getElement(
      "loginMessage"
    );

  hideMessage(
    messageElement
  );

  const email =
    getElement(
      "adminEmail"
    )?.value
      .trim() || "";

  const password =
    getElement(
      "adminPassword"
    )?.value || "";

  if (!email || !password) {
    showMessage(
      messageElement,
      "Veuillez renseigner l’adresse électronique et le mot de passe.",
      "error"
    );

    return;
  }

  setButtonLoading(
    submitButton,
    true,
    "Connexion..."
  );

  try {
    const {
      data,
      error,
    } =
      await supabase.auth
        .signInWithPassword({
          email,
          password,
        });

    if (error) {
      throw error;
    }

    state.session =
      data?.session ||
      null;

    await checkAdminStatus();

    if (!state.isAdmin) {
      await supabase.auth
        .signOut();

      state.session = null;

      throw new Error(
        "Ce compte ne possède pas le rôle administrateur."
      );
    }

    getElement(
      "loginForm"
    )?.reset();

    closeLoginModal();

    await loadPublicReferenceData();
    await loadDocuments();
    await loadAdminData();

    showView(
      "admin"
    );

    showAdminTab(
      "organizations"
    );
  } catch (error) {
    showMessage(
      messageElement,
      getErrorMessage(
        error,
        "Connexion impossible."
      ),
      "error"
    );
  } finally {
    setButtonLoading(
      submitButton,
      false
    );
  }
}

/* ==========================================================
   25. DÉCONNEXION
   ========================================================== */

async function handleLogout(
  event
) {
  preventNativeFormSubmission(
    event
  );

  const {
    error,
  } =
    await supabase.auth
      .signOut();

  if (error) {
    window.alert(
      `Déconnexion impossible : ${error.message}`
    );

    return;
  }

  state.session = null;
  state.isAdmin = false;
  state.adminProfile = null;

  state.adminOrganizations = [];
  state.adminAlerts = [];
  state.adminAlertCommunes = [];

  updateAuthenticationInterface();

  try {
    await loadPublicReferenceData();
    await loadDocuments();
  } catch (error) {
    console.error(
      "Erreur après la déconnexion :",
      error
    );
  }

  showView(
    "home"
  );
}
/* ==========================================================
   26. CHARGEMENT DES ORGANISATIONS PUBLIQUES
   ========================================================== */

async function loadPublicOrganizations() {
  const {
    data,
    error,
  } = await supabase
    .from("organizations")
    .select(`
      id,
      name,
      acronym,
      slug,
      is_active
    `)
    .eq(
      "is_active",
      true
    )
    .order(
      "name",
      {
        ascending: true,
      }
    );

  if (error) {
    throw new Error(
      `Impossible de charger les organisations : ${error.message}`
    );
  }

  state.organizations =
    data || [];

  populateOrganizationSelects();
}

/* ==========================================================
   27. CHARGEMENT DES ALERTES ID PUBLIQUES
   ========================================================== */

async function loadPublicAlerts() {
  const {
    data,
    error,
  } = await supabase
    .from("alerts")
    .select(`
      id,
      alert_code,
      region,
      is_active,
      created_at,
      updated_at
    `)
    .eq(
      "is_active",
      true
    )
    .order(
      "alert_code",
      {
        ascending: false,
      }
    );

  if (error) {
    throw new Error(
      `Impossible de charger les Alertes ID : ${error.message}`
    );
  }

  state.alerts =
    data || [];

  populatePublishAlertSelect();
  populateAlertFilters();
}

/* ==========================================================
   28. CHARGEMENT DES COMMUNES LIÉES AUX ALERTES
   ========================================================== */

/**
 * La vue public.alert_commune_options doit idéalement exposer :
 *
 * - alert_commune_id
 * - alert_id
 * - alert_code
 * - region
 * - commune
 * - alert_is_active
 * - alert_commune_is_active
 *
 * Une tentative de repli est prévue pour une vue plus simple.
 */

async function loadPublicAlertCommuneOptions() {
  let data = null;
  let error = null;

  const completeResult =
    await supabase
      .from(
        "alert_commune_options"
      )
      .select(`
        alert_commune_id,
        alert_id,
        alert_code,
        region,
        commune,
        alert_is_active,
        alert_commune_is_active
      `)
      .eq(
        "alert_is_active",
        true
      )
      .eq(
        "alert_commune_is_active",
        true
      )
      .order(
        "alert_code",
        {
          ascending: false,
        }
      )
      .order(
        "commune",
        {
          ascending: true,
        }
      );

  data =
    completeResult.data;

  error =
    completeResult.error;

  /*
   * Repli compatible avec une vue qui ne contient pas encore
   * les colonnes alert_is_active et alert_commune_is_active.
   */
  if (error) {
    console.warn(
      "Chargement simplifié de la vue alert_commune_options :",
      error.message
    );

    const fallbackResult =
      await supabase
        .from(
          "alert_commune_options"
        )
        .select(`
          alert_commune_id,
          alert_id,
          alert_code,
          region,
          commune
        `)
        .order(
          "alert_code",
          {
            ascending: false,
          }
        )
        .order(
          "commune",
          {
            ascending: true,
          }
        );

    data =
      fallbackResult.data;

    error =
      fallbackResult.error;
  }

  if (error) {
    throw new Error(
      `Impossible de charger les communes des alertes : ${error.message}`
    );
  }

  state.alertCommuneOptions =
    (data || []).map(
      (item) => ({
        ...item,

        alert_is_active:
          item.alert_is_active ??
          true,

        alert_commune_is_active:
          item.alert_commune_is_active ??
          true,
      })
    );

  const currentAlertId =
    getElement(
      "publishAlert"
    )?.value || "";

  populatePublishCommuneSelect(
    currentAlertId
  );

  populateDocumentFilters();
}

/* ==========================================================
   29. CHARGEMENT GLOBAL DES RÉFÉRENTIELS PUBLICS
   ========================================================== */

async function loadPublicReferenceData() {
  const results =
    await Promise.allSettled([
      loadPublicOrganizations(),
      loadPublicAlerts(),
      loadPublicAlertCommuneOptions(),
    ]);

  const errors = [];

  results.forEach(
    (result) => {
      if (
        result.status ===
        "rejected"
      ) {
        errors.push(
          result.reason
        );

        console.error(
          "Erreur de chargement du référentiel :",
          result.reason
        );
      }
    }
  );

  return errors;
}

/* ==========================================================
   30. REMPLISSAGE DES LISTES D’ORGANISATIONS
   ========================================================== */

function populateOrganizationSelects() {
  const configurations = [
    {
      id:
        "publishOrganization",

      placeholder:
        "Sélectionner une organisation",
    },
    {
      id:
        "filterOrganization",

      placeholder:
        "Toutes les organisations",
    },
  ];

  configurations.forEach(
    ({
      id,
      placeholder,
    }) => {
      const select =
        getElement(id);

      if (!select) {
        return;
      }

      const currentValue =
        select.value;

      select.innerHTML = "";

      const defaultOption =
        document.createElement(
          "option"
        );

      defaultOption.value = "";

      defaultOption.textContent =
        placeholder;

      select.appendChild(
        defaultOption
      );

      state.organizations.forEach(
        (organization) => {
          const option =
            document.createElement(
              "option"
            );

          option.value =
            organization.id;

          option.textContent =
            organization.acronym
              ? `${organization.name} (${organization.acronym})`
              : organization.name;

          select.appendChild(
            option
          );
        }
      );

      const valueStillExists =
        state.organizations.some(
          (organization) =>
            organization.id ===
            currentValue
        );

      if (valueStillExists) {
        select.value =
          currentValue;
      } else {
        select.value = "";
      }
    }
  );
}

/* ==========================================================
   31. LISTE DES ALERTES POUR LA PUBLICATION
   ========================================================== */

function populatePublishAlertSelect() {
  const select =
    getElement(
      "publishAlert"
    );

  if (!select) {
    return;
  }

  const currentValue =
    select.value;

  select.innerHTML = "";

  const defaultOption =
    document.createElement(
      "option"
    );

  defaultOption.value = "";

  defaultOption.textContent =
    state.alerts.length > 0
      ? "Sélectionner une Alerte ID"
      : "Aucune Alerte ID disponible";

  select.appendChild(
    defaultOption
  );

  state.alerts.forEach(
    (alertItem) => {
      const option =
        document.createElement(
          "option"
        );

      option.value =
        alertItem.id;

      option.textContent =
        alertItem.region
          ? `${alertItem.alert_code} — ${alertItem.region}`
          : alertItem.alert_code;

      select.appendChild(
        option
      );
    }
  );

  select.disabled =
    state.alerts.length === 0;

  const valueStillExists =
    state.alerts.some(
      (alertItem) =>
        alertItem.id ===
        currentValue
    );

  if (valueStillExists) {
    select.value =
      currentValue;
  } else {
    select.value = "";
  }
}

/* ==========================================================
   32. LISTE DES ALERTES POUR LE FILTRE DOCUMENTAIRE
   ========================================================== */

function populateAlertFilters() {
  const select =
    getElement(
      "filterAlert"
    );

  if (!select) {
    return;
  }

  const currentValue =
    select.value;

  select.innerHTML = "";

  const defaultOption =
    document.createElement(
      "option"
    );

  defaultOption.value = "";

  defaultOption.textContent =
    "Toutes les alertes";

  select.appendChild(
    defaultOption
  );

  state.alerts.forEach(
    (alertItem) => {
      const option =
        document.createElement(
          "option"
        );

      option.value =
        alertItem.alert_code;

      option.textContent =
        alertItem.alert_code;

      select.appendChild(
        option
      );
    }
  );

  const valueStillExists =
    state.alerts.some(
      (alertItem) =>
        alertItem.alert_code ===
        currentValue
    );

  if (valueStillExists) {
    select.value =
      currentValue;
  } else {
    select.value = "";
  }
}

/* ==========================================================
   33. LISTE DES COMMUNES SELON L’ALERTE ID
   ========================================================== */

function populatePublishCommuneSelect(
  alertId
) {
  const select =
    getElement(
      "publishCommune"
    );

  if (!select) {
    return;
  }

  const currentValue =
    select.value;

  select.innerHTML = "";

  if (!alertId) {
    const option =
      document.createElement(
        "option"
      );

    option.value = "";

    option.textContent =
      "Sélectionner d’abord une Alerte ID";

    select.appendChild(
      option
    );

    select.disabled =
      true;

    return;
  }

  const matchingCommunes =
    getAlertCommunes(
      alertId,
      true
    );

  if (
    matchingCommunes.length ===
    0
  ) {
    const option =
      document.createElement(
        "option"
      );

    option.value = "";

    option.textContent =
      "Aucune commune disponible pour cette alerte";

    select.appendChild(
      option
    );

    select.disabled =
      true;

    return;
  }

  const defaultOption =
    document.createElement(
      "option"
    );

  defaultOption.value = "";

  defaultOption.textContent =
    "Sélectionner une commune";

  select.appendChild(
    defaultOption
  );

  matchingCommunes
    .slice()
    .sort(
      (a, b) =>
        a.commune.localeCompare(
          b.commune,
          "fr",
          {
            sensitivity:
              "base",
          }
        )
    )
    .forEach(
      (item) => {
        const option =
          document.createElement(
            "option"
          );

        option.value =
          item.alert_commune_id;

        option.textContent =
          item.commune;

        select.appendChild(
          option
        );
      }
    );

  select.disabled =
    false;

  const valueStillExists =
    matchingCommunes.some(
      (item) =>
        item.alert_commune_id ===
        currentValue
    );

  if (valueStillExists) {
    select.value =
      currentValue;
  } else {
    select.value = "";
  }
}

/* ==========================================================
   34. MISE À JOUR DE LA RÉGION DE PUBLICATION
   ========================================================== */

function updatePublishRegion(
  alertId
) {
  const regionInput =
    getElement(
      "publishRegion"
    );

  if (!regionInput) {
    return;
  }

  const alertItem =
    getAlertById(
      alertId
    );

  regionInput.value =
    alertItem?.region || "";
}

/* ==========================================================
   35. RÉINITIALISATION DES COMMUNES DE PUBLICATION
   ========================================================== */

function resetPublishCommuneSelection() {
  state.selectedPublishCommune =
    null;

  const communeSelect =
    getElement(
      "publishCommune"
    );

  if (!communeSelect) {
    return;
  }

  communeSelect.innerHTML = `
    <option value="">
      Sélectionner d’abord une Alerte ID
    </option>
  `;

  communeSelect.value = "";

  communeSelect.disabled =
    true;
}
/* ==========================================================
   36. CHANGEMENT DE L’ORGANISATION DE PUBLICATION
   ========================================================== */

function handlePublishOrganizationChange() {
  updatePublishSummary();
}

/* ==========================================================
   37. CHANGEMENT DE L’ALERTE ID
   ========================================================== */

function handlePublishAlertChange() {
  const alertId =
    getElement(
      "publishAlert"
    )?.value || "";

  state.selectedPublishAlert =
    getAlertById(
      alertId
    );

  state.selectedPublishCommune =
    null;

  updatePublishRegion(
    alertId
  );

  populatePublishCommuneSelect(
    alertId
  );

  const communeSelect =
    getElement(
      "publishCommune"
    );

  if (communeSelect) {
    communeSelect.value = "";
  }

  updatePublishSummary();
}

/* ==========================================================
   38. CHANGEMENT DE LA COMMUNE
   ========================================================== */

function handlePublishCommuneChange() {
  const alertCommuneId =
    getElement(
      "publishCommune"
    )?.value || "";

  const selectedCommune =
    getAlertCommuneById(
      alertCommuneId
    );

  if (
    selectedCommune &&
    state.selectedPublishAlert &&
    selectedCommune.alert_id !==
      state.selectedPublishAlert.id
  ) {
    state.selectedPublishCommune =
      null;

    const communeSelect =
      getElement(
        "publishCommune"
      );

    if (communeSelect) {
      communeSelect.value = "";
    }

    showMessage(
      getElement(
        "publishMessage"
      ),
      "La commune sélectionnée ne correspond pas à l’Alerte ID choisie.",
      "error"
    );

    updatePublishSummary();

    return;
  }

  state.selectedPublishCommune =
    selectedCommune;

  hideMessage(
    getElement(
      "publishMessage"
    )
  );

  updatePublishSummary();
}

/* ==========================================================
   39. CHANGEMENT DU FICHIER PDF
   ========================================================== */

function handlePublishFileChange() {
  const fileInput =
    getElement(
      "publishFile"
    );

  const selectedFileInfo =
    getElement(
      "selectedFileInfo"
    );

  const file =
    fileInput
      ?.files?.[0];

  hideMessage(
    getElement(
      "publishMessage"
    )
  );

  if (!selectedFileInfo) {
    updatePublishSummary();
    return;
  }

  if (!file) {
    selectedFileInfo.innerHTML = "";

    selectedFileInfo.classList.add(
      "hidden"
    );

    updatePublishSummary();

    return;
  }

  try {
    validatePdf(
      file
    );

    selectedFileInfo.innerHTML = `
      <div class="selected-file-content">
        <strong>
          ${escapeHtml(
            file.name
          )}
        </strong>

        <span>
          ${formatFileSize(
            file.size
          )}
        </span>
      </div>
    `;

    selectedFileInfo.classList.remove(
      "hidden"
    );
  } catch (error) {
    fileInput.value = "";

    selectedFileInfo.innerHTML = "";

    selectedFileInfo.classList.add(
      "hidden"
    );

    showMessage(
      getElement(
        "publishMessage"
      ),
      getErrorMessage(
        error,
        "Le fichier sélectionné est invalide."
      ),
      "error"
    );
  }

  updatePublishSummary();
}

/* ==========================================================
   40. MISE À JOUR DU RÉCAPITULATIF
   ========================================================== */

function updatePublishSummary() {
  const organizationId =
    getElement(
      "publishOrganization"
    )?.value || "";

  const alertId =
    getElement(
      "publishAlert"
    )?.value || "";

  const alertCommuneId =
    getElement(
      "publishCommune"
    )?.value || "";

  const organization =
    getOrganizationById(
      organizationId
    );

  const alertOption =
    getAlertById(
      alertId
    );

  const communeOption =
    getAlertCommuneById(
      alertCommuneId
    );

  const file =
    getElement(
      "publishFile"
    )?.files?.[0];

  const values = {
    summaryOrganization:
      organization?.name ||
      "—",

    summaryAlert:
      alertOption?.alert_code ||
      "—",

    summaryRegion:
      alertOption?.region ||
      "—",

    summaryCommune:
      communeOption?.commune ||
      "—",

    summaryFile:
      file?.name ||
      "—",
  };

  Object.entries(
    values
  ).forEach(
    ([
      elementId,
      value,
    ]) => {
      const element =
        getElement(
          elementId
        );

      if (element) {
        element.textContent =
          value;
      }
    }
  );
}

/* ==========================================================
   41. BARRE DE PROGRESSION
   ========================================================== */

function updatePublishProgress(
  value
) {
  const wrapper =
    getElement(
      "publishProgressWrapper"
    );

  const bar =
    getElement(
      "publishProgressBar"
    );

  const text =
    getElement(
      "publishProgressText"
    );

  const progressTrack =
    wrapper?.querySelector(
      '[role="progressbar"]'
    );

  if (
    !wrapper ||
    !bar ||
    !text
  ) {
    return;
  }

  const normalizedValue =
    Math.min(
      100,
      Math.max(
        0,
        Number(value) || 0
      )
    );

  wrapper.classList.remove(
    "hidden"
  );

  bar.style.width =
    `${normalizedValue}%`;

  text.textContent =
    `${normalizedValue} %`;

  progressTrack?.setAttribute(
    "aria-valuenow",
    String(
      normalizedValue
    )
  );
}

function resetPublishProgress() {
  const wrapper =
    getElement(
      "publishProgressWrapper"
    );

  const bar =
    getElement(
      "publishProgressBar"
    );

  const text =
    getElement(
      "publishProgressText"
    );

  const progressTrack =
    wrapper?.querySelector(
      '[role="progressbar"]'
    );

  wrapper?.classList.add(
    "hidden"
  );

  if (bar) {
    bar.style.width =
      "0%";
  }

  if (text) {
    text.textContent =
      "0 %";
  }

  progressTrack?.setAttribute(
    "aria-valuenow",
    "0"
  );
}

/* ==========================================================
   42. CONSTRUCTION DU CHEMIN STORAGE
   ========================================================== */

function buildDocumentStoragePath({
  organization,
  alertOption,
  communeOption,
  file,
}) {
  const organizationFolder =
    slugify(
      organization.acronym ||
      organization.name
    ) ||
    "organisation";

  const alertFolder =
    slugify(
      alertOption.alert_code
    ) ||
    "alerte";

  const communeFolder =
    slugify(
      communeOption.commune
    ) ||
    "commune";

  const safeFileName =
    sanitizeFileName(
      file.name
    );

  const uniqueFileName =
    [
      Date.now(),
      generateUniqueId(),
      safeFileName,
    ].join("-");

  return [
    organizationFolder,
    alertFolder,
    communeFolder,
    uniqueFileName,
  ].join("/");
}

/* ==========================================================
   43. VALIDATION DE LA PUBLICATION
   ========================================================== */

function validatePublicationSelection({
  organization,
  alertOption,
  communeOption,
  file,
}) {
  if (!organization) {
    throw new Error(
      "Veuillez sélectionner une organisation."
    );
  }

  if (
    organization.is_active ===
    false
  ) {
    throw new Error(
      "L’organisation sélectionnée est inactive."
    );
  }

  if (!alertOption) {
    throw new Error(
      "Veuillez sélectionner une Alerte ID valide."
    );
  }

  if (
    alertOption.is_active ===
    false
  ) {
    throw new Error(
      "L’Alerte ID sélectionnée est inactive."
    );
  }

  if (!communeOption) {
    throw new Error(
      "Veuillez sélectionner une commune."
    );
  }

  if (
    communeOption.alert_id !==
    alertOption.id
  ) {
    throw new Error(
      "La commune sélectionnée ne correspond pas à l’Alerte ID choisie."
    );
  }

  if (
    communeOption
      .alert_commune_is_active ===
    false
  ) {
    throw new Error(
      "La commune sélectionnée est inactive."
    );
  }

  validatePdf(
    file
  );
}

/* ==========================================================
   44. PUBLICATION PUBLIQUE DU DOCUMENT
   ========================================================== */

async function handlePublicPublication(
  event
) {
  preventNativeFormSubmission(
    event
  );

  if (
    state.documentPublicationInProgress
  ) {
    return;
  }

  const submitButton =
    event?.submitter ||
    getElement(
      "publishSubmitButton"
    );

  const messageElement =
    getElement(
      "publishMessage"
    );

  hideMessage(
    messageElement
  );

  let uploadedStoragePath = "";
  let databaseRecordCreated =
    false;

  state.documentPublicationInProgress =
    true;

  setButtonLoading(
    submitButton,
    true,
    "Publication..."
  );

  try {
    const organizationId =
      getElement(
        "publishOrganization"
      )?.value || "";

    const alertId =
      getElement(
        "publishAlert"
      )?.value || "";

    const alertCommuneId =
      getElement(
        "publishCommune"
      )?.value || "";

    const file =
      getElement(
        "publishFile"
      )?.files?.[0];

    const organization =
      getOrganizationById(
        organizationId
      );

    const alertOption =
      getAlertById(
        alertId
      );

    const communeOption =
      getAlertCommuneById(
        alertCommuneId
      );

    validatePublicationSelection({
      organization,
      alertOption,
      communeOption,
      file,
    });

    state.selectedPublishAlert =
      alertOption;

    state.selectedPublishCommune =
      communeOption;

    updatePublishProgress(
      10
    );

    const storagePath =
      buildDocumentStoragePath({
        organization,
        alertOption,
        communeOption,
        file,
      });

    uploadedStoragePath =
      storagePath;

    const {
      error: uploadError,
    } = await supabase.storage
      .from(
        CONFIG.STORAGE_BUCKET
      )
      .upload(
        storagePath,
        file,
        {
          cacheControl:
            CONFIG.STORAGE_CACHE_CONTROL ||
            "3600",

          contentType:
            "application/pdf",

          upsert:
            false,
        }
      );

    if (uploadError) {
      throw new Error(
        `Chargement du fichier impossible : ${uploadError.message}`
      );
    }

    updatePublishProgress(
      65
    );

    const documentRecord = {
      organization_id:
        organization.id,

      alert_id:
        alertOption.id,

      alert_commune_id:
        communeOption
          .alert_commune_id,

      organization_name:
        organization.name,

      alert_code:
        alertOption.alert_code,

      file_name:
        file.name,

      storage_path:
        storagePath,

      file_size:
        file.size,

      mime_type:
        "application/pdf",

      publication_status:
        CONFIG.DEFAULT_PUBLICATION_STATUS ||
        "published",

      uploaded_by:
        state.session
          ?.user
          ?.id ||
        null,
    };

    const {
      error: insertError,
    } = await supabase
      .from(
        "documents"
      )
      .insert(
        documentRecord
      );

    if (insertError) {
      throw new Error(
        `Enregistrement du document impossible : ${insertError.message}`
      );
    }

    databaseRecordCreated =
      true;

    uploadedStoragePath = "";

    updatePublishProgress(
      100
    );

    resetPublishForm({
      preserveMessage:
        true,
    });

    showMessage(
      messageElement,
      "La fiche a été publiée avec succès.",
      "success"
    );

    await loadDocuments();
  } catch (error) {
    console.error(
      "Erreur de publication :",
      error
    );

    if (
      uploadedStoragePath &&
      !databaseRecordCreated
    ) {
      const {
        error: cleanupError,
      } = await supabase.storage
        .from(
          CONFIG.STORAGE_BUCKET
        )
        .remove([
          uploadedStoragePath,
        ]);

      if (cleanupError) {
        console.warn(
          "Le fichier chargé n’a pas pu être supprimé après l’échec :",
          cleanupError
        );
      }
    }

    showMessage(
      messageElement,
      getErrorMessage(
        error,
        "Impossible de publier la fiche."
      ),
      "error"
    );
  } finally {
    state.documentPublicationInProgress =
      false;

    setButtonLoading(
      submitButton,
      false
    );

    window.setTimeout(
      resetPublishProgress,
      1200
    );
  }
}

/* ==========================================================
   45. RÉINITIALISATION DU FORMULAIRE DE PUBLICATION
   ========================================================== */

function resetPublishForm(
  options = {}
) {
  const {
    preserveMessage = false,
  } = options;

  const form =
    getElement(
      "publishForm"
    );

  form?.reset();

  state.selectedPublishAlert =
    null;

  state.selectedPublishCommune =
    null;

  const organizationSelect =
    getElement(
      "publishOrganization"
    );

  const alertSelect =
    getElement(
      "publishAlert"
    );

  const regionInput =
    getElement(
      "publishRegion"
    );

  const communeSelect =
    getElement(
      "publishCommune"
    );

  const fileInfo =
    getElement(
      "selectedFileInfo"
    );

  if (organizationSelect) {
    organizationSelect.value =
      "";
  }

  if (alertSelect) {
    alertSelect.value = "";

    alertSelect.disabled =
      state.alerts.length ===
      0;
  }

  if (regionInput) {
    regionInput.value = "";
  }

  if (communeSelect) {
    communeSelect.innerHTML = `
      <option value="">
        Sélectionner d’abord une Alerte ID
      </option>
    `;

    communeSelect.value = "";

    communeSelect.disabled =
      true;
  }

  if (fileInfo) {
    fileInfo.innerHTML = "";

    fileInfo.classList.add(
      "hidden"
    );
  }

  if (!preserveMessage) {
    hideMessage(
      getElement(
        "publishMessage"
      )
    );
  }

  resetPublishProgress();
  updatePublishSummary();
}

/* ==========================================================
   46. CHARGEMENT DES DOCUMENTS
   ========================================================== */

async function loadDocuments() {
  let query =
    supabase
      .from("documents")
      .select(`
        id,
        organization_id,
        alert_id,
        alert_commune_id,
        organization_name,
        alert_code,
        file_name,
        storage_path,
        file_size,
        mime_type,
        publication_status,
        uploaded_by,
        created_at,
        updated_at
      `)
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

  if (!state.isAdmin) {
    query = query.eq(
      "publication_status",
      "published"
    );
  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    throw new Error(
      `Impossible de charger les documents : ${error.message}`
    );
  }

  state.documents =
    enrichDocuments(
      data || []
    );

  renderDocuments();
  renderStatistics();
  populateDocumentFilters();

  if (state.isAdmin) {
    renderAdminDocuments();
  }
}

/* ==========================================================
   47. ENRICHISSEMENT DES DOCUMENTS
   ========================================================== */

function enrichDocuments(
  documents
) {
  const publicCommunesMap =
    new Map(
      state
        .alertCommuneOptions
        .map(
          (item) => [
            item.alert_commune_id,
            item,
          ]
        )
    );

  const adminCommunesMap =
    new Map(
      state
        .adminAlertCommunes
        .map(
          (item) => [
            item.id,
            item,
          ]
        )
    );

  const publicAlertsMap =
    new Map(
      state.alerts.map(
        (item) => [
          item.id,
          item,
        ]
      )
    );

  const adminAlertsMap =
    new Map(
      state.adminAlerts.map(
        (item) => [
          item.id,
          item,
        ]
      )
    );

  return documents.map(
    (documentItem) => {
      const publicCommune =
        publicCommunesMap.get(
          documentItem
            .alert_commune_id
        ) ||
        null;

      const adminCommune =
        adminCommunesMap.get(
          documentItem
            .alert_commune_id
        ) ||
        null;

      const alertOption =
        publicAlertsMap.get(
          documentItem.alert_id
        ) ||
        adminAlertsMap.get(
          documentItem.alert_id
        ) ||
        null;

      const communeOption =
        publicCommune ||
        adminCommune ||
        null;

      return {
        ...documentItem,

        region:
          publicCommune?.region ||
          alertOption?.region ||
          "",

        commune:
          communeOption?.commune ||
          "",

        alert_is_active:
          publicCommune
            ?.alert_is_active ??
          alertOption
            ?.is_active ??
          null,

        alert_commune_is_active:
          publicCommune
            ?.alert_commune_is_active ??
          adminCommune
            ?.is_active ??
          null,
      };
    }
  );
}

/* ==========================================================
   48. RÉENRICHISSEMENT DES DOCUMENTS
   ========================================================== */

function refreshDocumentEnrichment() {
  state.documents =
    enrichDocuments(
      state.documents
    );

  renderDocuments();
  renderStatistics();
  populateDocumentFilters();

  if (state.isAdmin) {
    renderAdminDocuments();
  }
}

/* ==========================================================
   49. FILTRAGE DES DOCUMENTS
   ========================================================== */

function getFilteredDocuments() {
  const searchValue =
    normalizeText(
      getElement(
        "documentSearch"
      )?.value || ""
    );

  const organizationId =
    getElement(
      "filterOrganization"
    )?.value || "";

  const alertCode =
    getElement(
      "filterAlert"
    )?.value || "";

  const commune =
    getElement(
      "filterCommune"
    )?.value || "";

  return state.documents.filter(
    (documentItem) => {
      if (
        !state.isAdmin &&
        documentItem
          .publication_status !==
          "published"
      ) {
        return false;
      }

      const searchableText =
        normalizeText(
          [
            documentItem.file_name,
            documentItem
              .organization_name,
            documentItem.alert_code,
            documentItem.region,
            documentItem.commune,
          ]
            .filter(Boolean)
            .join(" ")
        );

      const matchesSearch =
        !searchValue ||
        searchableText.includes(
          searchValue
        );

      const matchesOrganization =
        !organizationId ||
        documentItem
          .organization_id ===
          organizationId;

      const matchesAlert =
        !alertCode ||
        documentItem
          .alert_code ===
          alertCode;

      const matchesCommune =
        !commune ||
        documentItem
          .commune ===
          commune;

      return (
        matchesSearch &&
        matchesOrganization &&
        matchesAlert &&
        matchesCommune
      );
    }
  );
}

/* ==========================================================
   50. AFFICHAGE DES DOCUMENTS PUBLICS
   ========================================================== */

function renderDocuments() {
  const container =
    getElement(
      "documentsList"
    );

  if (!container) {
    return;
  }

  const visibleDocuments =
    getFilteredDocuments()
      .filter(
        (item) =>
          item
            .publication_status ===
          "published"
      );

  updateDocumentsResultTitle(
    visibleDocuments.length
  );

  if (
    visibleDocuments.length ===
    0
  ) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>
          Aucun document trouvé
        </h3>

        <p>
          Modifiez les critères de recherche ou publiez une nouvelle fiche.
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML =
    visibleDocuments
      .map(
        (documentItem) =>
          createDocumentCard(
            documentItem
          )
      )
      .join("");
}

/* ==========================================================
   51. TITRE DES RÉSULTATS
   ========================================================== */

function updateDocumentsResultTitle(
  documentCount
) {
  const title =
    getElement(
      "documentsResultTitle"
    );

  if (!title) {
    return;
  }

  const plural =
    documentCount > 1;

  title.textContent =
    `${documentCount} fiche${
      plural ? "s" : ""
    } publiée${
      plural ? "s" : ""
    }`;
}

/* ==========================================================
   52. CARTE D’UN DOCUMENT
   ========================================================== */

function createDocumentCard(
  documentItem
) {
  const publicUrl =
    getPublicUrl(
      documentItem.storage_path
    );

  const fileName =
    documentItem.file_name ||
    "Document PDF";

  const organizationName =
    documentItem.organization_name ||
    "Organisation non renseignée";

  const alertCode =
    documentItem.alert_code ||
    "Alerte non renseignée";

  const region =
    documentItem.region ||
    "Non renseignée";

  const commune =
    documentItem.commune ||
    "Non renseignée";

  const downloadControl =
    publicUrl
      ? `
        <a
          class="button button-primary"
          href="${escapeHtml(publicUrl)}"
          target="_blank"
          rel="noopener noreferrer"
          download
        >
          Télécharger la fiche
        </a>
      `
      : `
        <button
          type="button"
          class="button button-secondary"
          disabled
        >
          Fichier indisponible
        </button>
      `;

  return `
    <article class="document-card">
      <div class="document-card-main">
        <div class="document-card-header">
          <span class="document-type">
            PDF
          </span>

          <span class="commune-badge">
            ${escapeHtml(commune)}
          </span>
        </div>

        <h3>
          ${escapeHtml(fileName)}
        </h3>
      </div>

      <dl class="document-metadata">
        <div>
          <dt>Organisation</dt>

          <dd>
            ${escapeHtml(organizationName)}
          </dd>
        </div>

        <div>
          <dt>Alerte ID</dt>

          <dd>
            ${escapeHtml(alertCode)}
          </dd>
        </div>

        <div>
          <dt>Région</dt>

          <dd>
            ${escapeHtml(region)}
          </dd>
        </div>

        <div>
          <dt>Commune</dt>

          <dd>
            ${escapeHtml(commune)}
          </dd>
        </div>
      </dl>

      <div class="document-card-actions">
        <div class="document-card-footer">
          <span>
            ${formatFileSize(documentItem.file_size)}
          </span>

          <span>
            ${formatDate(documentItem.created_at)}
          </span>
        </div>

        ${downloadControl}
      </div>
    </article>
  `;
}
/* ==========================================================
   53. STATISTIQUES PUBLIQUES
   ========================================================== */

function renderStatistics() {
  const publishedDocuments =
    state.documents.filter(
      (item) =>
        item
          .publication_status ===
        "published"
    );

  const organizationIds =
    new Set(
      publishedDocuments
        .map(
          (item) =>
            item.organization_id
        )
        .filter(Boolean)
    );

  const alertIds =
    new Set(
      publishedDocuments
        .map(
          (item) =>
            item.alert_id ||
            item.alert_code
        )
        .filter(Boolean)
    );

  const communeIds =
    new Set(
      publishedDocuments
        .map(
          (item) =>
            item
              .alert_commune_id ||
            item.commune
        )
        .filter(Boolean)
    );

  const statistics = {
    documentsCount:
      publishedDocuments.length,

    organizationsCount:
      organizationIds.size,

    alertsCount:
      alertIds.size,

    communesCount:
      communeIds.size,
  };

  Object.entries(
    statistics
  ).forEach(
    ([
      elementId,
      value,
    ]) => {
      const element =
        getElement(
          elementId
        );

      if (element) {
        element.textContent =
          String(value);
      }
    }
  );
}

/* ==========================================================
   54. FILTRES DOCUMENTAIRES
   ========================================================== */

function populateDocumentFilters() {
  populateUniqueSelect(
    "filterCommune",
    state.documents.map(
      (item) =>
        item.commune
    ),
    "Toutes les communes"
  );
}

function populateUniqueSelect(
  selectId,
  values,
  defaultLabel
) {
  const select =
    getElement(
      selectId
    );

  if (!select) {
    return;
  }

  const currentValue =
    select.value;

  const valuesList =
    uniqueValues(
      values
    );

  select.innerHTML = "";

  const defaultOption =
    document.createElement(
      "option"
    );

  defaultOption.value = "";

  defaultOption.textContent =
    defaultLabel;

  select.appendChild(
    defaultOption
  );

  valuesList.forEach(
    (value) => {
      const option =
        document.createElement(
          "option"
        );

      option.value =
        value;

      option.textContent =
        value;

      select.appendChild(
        option
      );
    }
  );

  if (
    valuesList.includes(
      currentValue
    )
  ) {
    select.value =
      currentValue;
  } else {
    select.value = "";
  }
}

/* ==========================================================
   55. RÉINITIALISATION DES FILTRES
   ========================================================== */

function resetDocumentFilters(
  event
) {
  preventNativeFormSubmission(
    event
  );

  [
    "documentSearch",
    "filterOrganization",
    "filterAlert",
    "filterCommune",
  ].forEach(
    (id) => {
      const element =
        getElement(id);

      if (element) {
        element.value = "";
      }
    }
  );

  renderDocuments();
}

/* ==========================================================
   56. ACTUALISATION MANUELLE DES DOCUMENTS
   ========================================================== */

async function refreshDocuments(
  event
) {
  preventNativeFormSubmission(
    event
  );

  const button =
    getElement(
      "refreshDocumentsButton"
    );

  setButtonLoading(
    button,
    true,
    "Actualisation..."
  );

  try {
    await loadDocuments();
  } catch (error) {
    console.error(
      "Erreur d’actualisation des documents :",
      error
    );

    window.alert(
      getErrorMessage(
        error,
        "Impossible d’actualiser les documents."
      )
    );
  } finally {
    setButtonLoading(
      button,
      false
    );
  }
}
/* ==========================================================
   57. CHARGEMENT GLOBAL DES DONNÉES ADMINISTRATIVES
   ========================================================== */

async function loadAdminData() {
  if (!state.isAdmin) {
    return;
  }

  const messageElement =
    getElement(
      "adminGlobalMessage"
    );

  hideMessage(
    messageElement
  );

  const results =
    await Promise.allSettled([
      loadAdminOrganizations(),
      loadAdminAlerts(),
    ]);

  const errors =
    results
      .filter(
        (result) =>
          result.status ===
          "rejected"
      )
      .map(
        (result) =>
          result.reason
      );

  if (
    errors.length > 0
  ) {
    errors.forEach(
      (error) => {
        console.error(
          "Erreur de chargement administratif :",
          error
        );
      }
    );

    showMessage(
      messageElement,
      errors
        .map(
          (error) =>
            getErrorMessage(
              error,
              "Erreur de chargement administratif."
            )
        )
        .join(" "),
      "error"
    );
  }

  renderAdminDocuments();
}

/* ==========================================================
   58. CHARGEMENT DES ORGANISATIONS ADMINISTRATIVES
   ========================================================== */

async function loadAdminOrganizations() {
  if (!state.isAdmin) {
    state.adminOrganizations = [];
    return;
  }

  const {
    data,
    error,
  } = await supabase
    .from(
      "organizations"
    )
    .select(`
      id,
      name,
      acronym,
      slug,
      is_active,
      created_at,
      updated_at
    `)
    .order(
      "name",
      {
        ascending: true,
      }
    );

  if (error) {
    throw new Error(
      `Impossible de charger les organisations : ${error.message}`
    );
  }

  state.adminOrganizations =
    data || [];

  renderAdminOrganizations();
}

/* ==========================================================
   59. AFFICHAGE DES ORGANISATIONS ADMINISTRATIVES
   ========================================================== */

function renderAdminOrganizations() {
  const tableBody =
    getElement(
      "adminOrganizationsTable"
    );

  if (!tableBody) {
    return;
  }

  if (!state.isAdmin) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5">
          Accès administrateur requis.
        </td>
      </tr>
    `;

    return;
  }

  if (
    state.adminOrganizations.length ===
    0
  ) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5">
          Aucune organisation enregistrée.
        </td>
      </tr>
    `;

    return;
  }

  tableBody.innerHTML =
    state.adminOrganizations
      .map(
        (organization) => `
          <tr>
            <td>
              <strong>
                ${escapeHtml(
                  organization.name
                )}
              </strong>
            </td>

            <td>
              ${escapeHtml(
                organization.acronym ||
                "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                organization.slug ||
                "—"
              )}
            </td>

            <td>
              <span class="status-badge ${
                organization.is_active
                  ? "status-active"
                  : "status-inactive"
              }">
                ${
                  organization.is_active
                    ? "Active"
                    : "Inactive"
                }
              </span>
            </td>

            <td>
              <div class="table-actions">
                <button
                  type="button"
                  class="button button-small button-secondary"
                  data-action="edit-organization"
                  data-id="${escapeHtml(
                    organization.id
                  )}"
                >
                  Modifier
                </button>

                <button
                  type="button"
                  class="button button-small ${
                    organization.is_active
                      ? "button-danger"
                      : "button-primary"
                  }"
                  data-action="toggle-organization"
                  data-id="${escapeHtml(
                    organization.id
                  )}"
                >
                  ${
                    organization.is_active
                      ? "Désactiver"
                      : "Activer"
                  }
                </button>
              </div>
            </td>
          </tr>
        `
      )
      .join("");
}

/* ==========================================================
   60. RÉINITIALISATION DU FORMULAIRE ORGANISATION
   ========================================================== */

function resetOrganizationForm(
  options = {}
) {
  const {
    preserveMessage = false,
  } = options;

  const form =
    getElement(
      "organizationForm"
    );

  form?.reset();

  const databaseId =
    getElement(
      "organizationDatabaseId"
    );

  const activeCheckbox =
    getElement(
      "organizationActive"
    );

  const submitButton =
    getElement(
      "organizationSubmitButton"
    );

  if (databaseId) {
    databaseId.value = "";
  }

  if (activeCheckbox) {
    activeCheckbox.checked =
      true;
  }

  if (submitButton) {
    submitButton.textContent =
      "Enregistrer l’organisation";
  }

  if (!preserveMessage) {
    hideMessage(
      getElement(
        "organizationMessage"
      )
    );
  }
}

/* ==========================================================
   61. CHARGEMENT D’UNE ORGANISATION DANS LE FORMULAIRE
   ========================================================== */

function editOrganization(
  organizationId
) {
  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const organization =
    state.adminOrganizations.find(
      (item) =>
        item.id ===
        organizationId
    );

  if (!organization) {
    window.alert(
      "Organisation introuvable."
    );

    return;
  }

  const databaseId =
    getElement(
      "organizationDatabaseId"
    );

  const nameInput =
    getElement(
      "organizationName"
    );

  const acronymInput =
    getElement(
      "organizationAcronym"
    );

  const activeCheckbox =
    getElement(
      "organizationActive"
    );

  const submitButton =
    getElement(
      "organizationSubmitButton"
    );

  if (databaseId) {
    databaseId.value =
      organization.id;
  }

  if (nameInput) {
    nameInput.value =
      organization.name ||
      "";
  }

  if (acronymInput) {
    acronymInput.value =
      organization.acronym ||
      "";
  }

  if (activeCheckbox) {
    activeCheckbox.checked =
      Boolean(
        organization.is_active
      );
  }

  if (submitButton) {
    submitButton.textContent =
      "Mettre à jour l’organisation";
  }

  hideMessage(
    getElement(
      "organizationMessage"
    )
  );

  nameInput?.focus();

  window.scrollTo({
    top:
      getElement(
        "organizationForm"
      )?.offsetTop || 0,

    behavior:
      "smooth",
  });
}

/* ==========================================================
   62. RECHERCHE D’UNE ORGANISATION EXISTANTE
   ========================================================== */

function findExistingOrganization({
  name,
  acronym,
  excludeId = "",
}) {
  const normalizedName =
    normalizeOrganizationKey(
      name
    );

  const normalizedAcronym =
    normalizeOrganizationKey(
      acronym
    );

  return (
    state.adminOrganizations.find(
      (organization) => {
        if (
          excludeId &&
          organization.id ===
          excludeId
        ) {
          return false;
        }

        const sameName =
          normalizeOrganizationKey(
            organization.name
          ) ===
          normalizedName;

        const sameAcronym =
          Boolean(
            normalizedAcronym
          ) &&
          normalizeOrganizationKey(
            organization.acronym
          ) ===
          normalizedAcronym;

        return (
          sameName ||
          sameAcronym
        );
      }
    ) ||
    null
  );
}

/* ==========================================================
   63. VALIDATION D’UNE ORGANISATION
   ========================================================== */

function validateOrganizationInput({
  name,
  acronym,
  excludeId = "",
}) {
  if (!name) {
    throw new Error(
      "Le nom de l’organisation est obligatoire."
    );
  }

  if (name.length < 2) {
    throw new Error(
      "Le nom de l’organisation est trop court."
    );
  }

  if (
    acronym &&
    acronym.length > 30
  ) {
    throw new Error(
      "L’acronyme ne doit pas dépasser 30 caractères."
    );
  }

  const duplicate =
    findExistingOrganization({
      name,
      acronym,
      excludeId,
    });

  if (duplicate) {
    throw new Error(
      `Une organisation similaire existe déjà : ${duplicate.name}.`
    );
  }
}

/* ==========================================================
   64. ENREGISTREMENT MANUEL D’UNE ORGANISATION
   ========================================================== */

async function handleOrganizationSubmit(
  event
) {
  preventNativeFormSubmission(
    event
  );

  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const submitButton =
    event?.submitter ||
    getElement(
      "organizationSubmitButton"
    );

  const messageElement =
    getElement(
      "organizationMessage"
    );

  hideMessage(
    messageElement
  );

  const organizationId =
    getElement(
      "organizationDatabaseId"
    )?.value || "";

  const name =
    getElement(
      "organizationName"
    )?.value
      .trim() || "";

  const acronym =
    getElement(
      "organizationAcronym"
    )?.value
      .trim() || "";

  const isActive =
    getElement(
      "organizationActive"
    )?.checked ??
    true;

  try {
    validateOrganizationInput({
      name,
      acronym,
      excludeId:
        organizationId,
    });
  } catch (error) {
    showMessage(
      messageElement,
      getErrorMessage(
        error,
        "Les informations de l’organisation sont invalides."
      ),
      "error"
    );

    return;
  }

  const payload = {
    name,

    acronym:
      acronym ||
      null,

    slug:
      slugify(
        acronym ||
        name
      ),

    is_active:
      Boolean(
        isActive
      ),

    updated_at:
      new Date().toISOString(),
  };

  setButtonLoading(
    submitButton,
    true,
    organizationId
      ? "Mise à jour..."
      : "Enregistrement..."
  );

  try {
    if (organizationId) {
      const {
        error,
      } = await supabase
        .from(
          "organizations"
        )
        .update(
          payload
        )
        .eq(
          "id",
          organizationId
        );

      if (error) {
        throw error;
      }
    } else {
      const {
        error,
      } = await supabase
        .from(
          "organizations"
        )
        .insert({
          ...payload,

          created_at:
            new Date().toISOString(),
        });

      if (error) {
        throw error;
      }
    }

    resetOrganizationForm({
      preserveMessage:
        true,
    });

    await Promise.all([
      loadAdminOrganizations(),
      loadPublicOrganizations(),
    ]);

    showMessage(
      messageElement,
      organizationId
        ? "Organisation mise à jour avec succès."
        : "Organisation créée avec succès.",
      "success"
    );

    showView(
      "admin"
    );

    showAdminTab(
      "organizations"
    );
  } catch (error) {
    console.error(
      "Erreur d’enregistrement de l’organisation :",
      error
    );

    showMessage(
      messageElement,
      getErrorMessage(
        error,
        "Impossible d’enregistrer l’organisation."
      ),
      "error"
    );
  } finally {
    setButtonLoading(
      submitButton,
      false
    );
  }
}

/* ==========================================================
   65. ACTIVATION OU DÉSACTIVATION D’UNE ORGANISATION
   ========================================================== */

async function toggleOrganizationStatus(
  organizationId
) {
  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const organization =
    state.adminOrganizations.find(
      (item) =>
        item.id ===
        organizationId
    );

  if (!organization) {
    window.alert(
      "Organisation introuvable."
    );

    return;
  }

  const newStatus =
    !organization.is_active;

  const confirmed =
    window.confirm(
      newStatus
        ? `Activer l’organisation « ${organization.name} » ?`
        : `Désactiver l’organisation « ${organization.name} » ?`
    );

  if (!confirmed) {
    return;
  }

  const {
    error,
  } = await supabase
    .from(
      "organizations"
    )
    .update({
      is_active:
        newStatus,

      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      organizationId
    );

  if (error) {
    window.alert(
      `Impossible de modifier le statut : ${error.message}`
    );

    return;
  }

  await Promise.all([
    loadAdminOrganizations(),
    loadPublicOrganizations(),
  ]);

  showView(
    "admin"
  );

  showAdminTab(
    "organizations"
  );
}

/* ==========================================================
   66. ACTIONS DU TABLEAU DES ORGANISATIONS
   ========================================================== */

function handleAdminOrganizationTableClick(
  event
) {
  const control =
    event.target.closest(
      "[data-action]"
    );

  if (!control) {
    return;
  }

  preventNativeFormSubmission(
    event
  );

  const organizationId =
    control.dataset.id;

  if (!organizationId) {
    return;
  }

  switch (
    control.dataset.action
  ) {
    case "edit-organization":
      editOrganization(
        organizationId
      );
      break;

    case "toggle-organization":
      toggleOrganizationStatus(
        organizationId
      );
      break;

    default:
      console.warn(
        `Action organisation inconnue : ${control.dataset.action}`
      );
      break;
  }
}
/* ==========================================================
   67. DÉTECTION DU SÉPARATEUR CSV
   ========================================================== */

function detectCsvDelimiter(text) {
  const firstNonEmptyLine =
    String(text || "")
      .split(/\r?\n/)
      .find(
        (line) =>
          line.trim()
      ) || "";

  const candidates = [
    {
      delimiter: "\t",
      count:
        (
          firstNonEmptyLine.match(
            /\t/g
          ) || []
        ).length,
    },
    {
      delimiter: ";",
      count:
        (
          firstNonEmptyLine.match(
            /;/g
          ) || []
        ).length,
    },
    {
      delimiter: ",",
      count:
        (
          firstNonEmptyLine.match(
            /,/g
          ) || []
        ).length,
    },
  ];

  candidates.sort(
    (a, b) =>
      b.count - a.count
  );

  return candidates[0].count > 0
    ? candidates[0].delimiter
    : ",";
}

/* ==========================================================
   68. ANALYSE D’UNE LIGNE CSV
   ========================================================== */

function parseCsvLine(
  line,
  delimiter
) {
  const values = [];

  let currentValue = "";
  let insideQuotes = false;

  for (
    let index = 0;
    index < line.length;
    index += 1
  ) {
    const character =
      line[index];

    const nextCharacter =
      line[index + 1];

    if (character === '"') {
      if (
        insideQuotes &&
        nextCharacter === '"'
      ) {
        currentValue += '"';
        index += 1;
      } else {
        insideQuotes =
          !insideQuotes;
      }

      continue;
    }

    if (
      character === delimiter &&
      !insideQuotes
    ) {
      values.push(
        currentValue.trim()
      );

      currentValue = "";
      continue;
    }

    currentValue +=
      character;
  }

  values.push(
    currentValue.trim()
  );

  return values;
}

/* ==========================================================
   69. TRANSFORMATION DU CSV EN OBJETS
   ========================================================== */

function parseCsvText(text) {
  const normalizedText =
    String(text || "")
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");

  const lines =
    normalizedText
      .split("\n")
      .filter(
        (line) =>
          line.trim()
      );

  if (lines.length < 2) {
    throw new Error(
      "Le fichier CSV ne contient aucune donnée exploitable."
    );
  }

  const delimiter =
    detectCsvDelimiter(
      normalizedText
    );

  const rawHeaders =
    parseCsvLine(
      lines[0],
      delimiter
    );

  const headers =
    rawHeaders.map(
      normalizeHeader
    );

  const duplicateHeaders =
    headers.filter(
      (header, index) =>
        headers.indexOf(
          header
        ) !== index
    );

  if (
    duplicateHeaders.length > 0
  ) {
    throw new Error(
      `Le fichier CSV contient des colonnes en double : ${uniqueValues(
        duplicateHeaders
      ).join(", ")}.`
    );
  }

  const rows = [];

  for (
    let index = 1;
    index < lines.length;
    index += 1
  ) {
    const values =
      parseCsvLine(
        lines[index],
        delimiter
      );

    const row = {
      __lineNumber:
        index + 1,
    };

    headers.forEach(
      (
        header,
        headerIndex
      ) => {
        row[header] =
          values[headerIndex]
            ?.trim() || "";
      }
    );

    rows.push(row);
  }

  return {
    rows,
    headers,
    delimiter,
  };
}

/* ==========================================================
   70. RÉCUPÉRATION D’UNE VALEUR CSV
   ========================================================== */

function getCsvValue(
  row,
  aliases
) {
  for (
    const alias
    of aliases
  ) {
    const normalizedAlias =
      normalizeHeader(
        alias
      );

    if (
      Object.prototype
        .hasOwnProperty
        .call(
          row,
          normalizedAlias
        )
    ) {
      return String(
        row[
          normalizedAlias
        ] ?? ""
      ).trim();
    }
  }

  return "";
}

/* ==========================================================
   71. CONVERSION DU STATUT CSV EN BOOLÉEN
   ========================================================== */

function parseBooleanCsvValue(
  value,
  defaultValue = true
) {
  const normalizedValue =
    normalizeText(
      value
    );

  if (!normalizedValue) {
    return defaultValue;
  }

  const trueValues = [
    "true",
    "1",
    "oui",
    "yes",
    "active",
    "actif",
    "activee",
  ];

  const falseValues = [
    "false",
    "0",
    "non",
    "no",
    "inactive",
    "inactif",
    "inactivee",
    "desactive",
    "desactivee",
  ];

  if (
    trueValues.includes(
      normalizedValue
    )
  ) {
    return true;
  }

  if (
    falseValues.includes(
      normalizedValue
    )
  ) {
    return false;
  }

  throw new Error(
    `Valeur is_active invalide : « ${value} ». Utilisez true, false, 1, 0, oui ou non.`
  );
}

/* ==========================================================
   72. VALIDATION DES COLONNES DU CSV DES ORGANISATIONS
   ========================================================== */

function validateOrganizationsCsvHeaders(
  headers
) {
  const headerSet =
    new Set(
      headers
    );

  const requiredHeaders = [
    "name",
    "acronym",
    "is_active",
  ];

  const missingHeaders =
    requiredHeaders.filter(
      (header) =>
        !headerSet.has(
          header
        )
    );

  if (
    missingHeaders.length > 0
  ) {
    throw new Error(
      `Colonnes obligatoires manquantes : ${missingHeaders.join(", ")}.`
    );
  }
}

/* ==========================================================
   73. NORMALISATION D’UNE LIGNE CSV D’ORGANISATION
   ========================================================== */

function normalizeOrganizationCsvRow(
  row
) {
  const name =
    getCsvValue(
      row,
      [
        "name",
        "nom",
        "organisation",
        "organization",
      ]
    );

  const acronym =
    getCsvValue(
      row,
      [
        "acronym",
        "acronyme",
        "sigle",
      ]
    );

  const activeValue =
    getCsvValue(
      row,
      [
        "is_active",
        "active",
        "statut",
        "status",
      ]
    );

  return {
    name:
      name.trim(),

    acronym:
      acronym.trim(),

    isActive:
      parseBooleanCsvValue(
        activeValue,
        true
      ),

    lineNumber:
      row.__lineNumber,
  };
}

/* ==========================================================
   74. REGROUPEMENT DES ORGANISATIONS DU CSV
   ========================================================== */

function groupOrganizationCsvRows(
  rows
) {
  const organizationsMap =
    new Map();

  const validationErrors = [];

  rows.forEach(
    (rawRow) => {
      let row;

      try {
        row =
          normalizeOrganizationCsvRow(
            rawRow
          );
      } catch (error) {
        validationErrors.push(
          `Ligne ${rawRow.__lineNumber} : ${getErrorMessage(
            error,
            "Valeur invalide."
          )}`
        );

        return;
      }

      const isEmpty =
        !row.name &&
        !row.acronym;

      if (isEmpty) {
        return;
      }

      if (!row.name) {
        validationErrors.push(
          `Ligne ${row.lineNumber} : le nom de l’organisation est obligatoire.`
        );

        return;
      }

      if (
        row.name.length < 2
      ) {
        validationErrors.push(
          `Ligne ${row.lineNumber} : le nom de l’organisation est trop court.`
        );

        return;
      }

      if (
        row.acronym &&
        row.acronym.length > 30
      ) {
        validationErrors.push(
          `Ligne ${row.lineNumber} : l’acronyme ne doit pas dépasser 30 caractères.`
        );

        return;
      }

      const organizationKey =
        normalizeOrganizationKey(
          row.name
        );

      /*
       * La dernière occurrence d’un même nom
       * remplace les précédentes dans le fichier.
       */
      organizationsMap.set(
        organizationKey,
        row
      );
    }
  );

  if (
    validationErrors.length > 0
  ) {
    const displayedErrors =
      validationErrors
        .slice(
          0,
          15
        )
        .join("\n");

    const remainingErrors =
      validationErrors.length -
      15;

    throw new Error(
      remainingErrors > 0
        ? `${displayedErrors}\n${remainingErrors} autre(s) erreur(s) non affichée(s).`
        : displayedErrors
    );
  }

  return [
    ...organizationsMap.values(),
  ].sort(
    (a, b) =>
      a.name.localeCompare(
        b.name,
        "fr",
        {
          sensitivity:
            "base",
        }
      )
  );
}
/* ==========================================================
   LECTURE DES CSV AVEC GESTION DE L’ENCODAGE
   ========================================================== */

async function readCsvFileWithEncoding(
  file
) {
  validateCsvFile(
    file
  );

  const buffer =
    await file.arrayBuffer();

  const bytes =
    new Uint8Array(
      buffer
    );

  /*
   * Détection du BOM UTF-8 :
   * EF BB BF
   */
  const hasUtf8Bom =
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf;

  /*
   * Première tentative en UTF-8 strict.
   */
  try {
    const utf8Decoder =
      new TextDecoder(
        "utf-8",
        {
          fatal: true,
        }
      );

    const decodedText =
      utf8Decoder.decode(
        hasUtf8Bom
          ? bytes.slice(3)
          : bytes
      );

    return decodedText
      .replace(/^\uFEFF/, "")
      .normalize("NFC");
  } catch (utf8Error) {
    console.warn(
      "Le fichier n’est pas en UTF-8. Tentative de lecture en Windows-1252.",
      utf8Error
    );
  }

  /*
   * Repli pour les fichiers CSV Excel enregistrés
   * en ANSI ou Windows-1252.
   */
  try {
    const windowsDecoder =
      new TextDecoder(
        "windows-1252"
      );

    return windowsDecoder
      .decode(bytes)
      .replace(/^\uFEFF/, "")
      .normalize("NFC");
  } catch (windowsError) {
    console.error(
      "Erreur de décodage du CSV :",
      windowsError
    );

    throw new Error(
      "Le fichier CSV utilise un encodage non reconnu. Enregistrez-le au format CSV UTF-8."
    );
  }
}

/* ==========================================================
   75. LECTURE DU CSV DES ORGANISATIONS
   ========================================================== */

async function readOrganizationsCsvFile() {
  const file =
    getElement(
      "organizationsCsvFile"
    )?.files?.[0];

  if (!file) {
    throw new Error(
      "Veuillez sélectionner le fichier CSV des organisations."
    );
  }

  return readCsvFileWithEncoding(
    file
  );
}
/* ==========================================================
   76. PRÉVISUALISATION DU CSV DES ORGANISATIONS
   ========================================================== */

function renderOrganizationsCsvPreview(
  organizations
) {
  const preview =
    getElement(
      "organizationsCsvPreview"
    );

  if (!preview) {
    return;
  }

  if (
    organizations.length === 0
  ) {
    preview.innerHTML = `
      <div class="empty-state">
        <h3>
          Aucune organisation valide
        </h3>

        <p>
          Vérifiez le contenu du fichier CSV.
        </p>
      </div>
    `;

    preview.classList.remove(
      "hidden"
    );

    return;
  }

  const activeCount =
    organizations.filter(
      (organization) =>
        organization.isActive
    ).length;

  const inactiveCount =
    organizations.length -
    activeCount;

  preview.innerHTML = `
    <div class="csv-preview-summary">
      <strong>
        ${organizations.length}
        organisation${
          organizations.length > 1
            ? "s"
            : ""
        }
      </strong>

      <span>
        ${activeCount} active${
          activeCount > 1
            ? "s"
            : ""
        }
      </span>

      <span>
        ${inactiveCount} inactive${
          inactiveCount > 1
            ? "s"
            : ""
        }
      </span>
    </div>

    <div class="table-card">
      <table>
        <thead>
          <tr>
            <th>
              Organisation
            </th>

            <th>
              Acronyme
            </th>

            <th>
              Statut
            </th>
          </tr>
        </thead>

        <tbody>
          ${organizations
            .slice(
              0,
              20
            )
            .map(
              (organization) => `
                <tr>
                  <td>
                    ${escapeHtml(
                      organization.name
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      organization.acronym ||
                      "—"
                    )}
                  </td>

                  <td>
                    <span class="status-badge ${
                      organization.isActive
                        ? "status-active"
                        : "status-inactive"
                    }">
                      ${
                        organization.isActive
                          ? "Active"
                          : "Inactive"
                      }
                    </span>
                  </td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>

    ${
      organizations.length > 20
        ? `
          <p class="helper-text">
            Aperçu limité aux 20 premières organisations.
          </p>
        `
        : ""
    }
  `;

  preview.classList.remove(
    "hidden"
  );
}

/* ==========================================================
   77. PRÉVISUALISATION DU FICHIER CSV
   ========================================================== */

async function handleOrganizationsCsvPreview(
  event
) {
  preventNativeFormSubmission(
    event
  );

  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const button =
    getElement(
      "organizationsCsvPreviewButton"
    );

  const messageElement =
    getElement(
      "organizationsImportMessage"
    );

  hideMessage(
    messageElement
  );

  setButtonLoading(
    button,
    true,
    "Analyse..."
  );

  try {
    const csvText =
      await readOrganizationsCsvFile();

    const {
      rows,
      headers,
    } = parseCsvText(
      csvText
    );

    validateOrganizationsCsvHeaders(
      headers
    );

    const organizations =
      groupOrganizationCsvRows(
        rows
      );

    renderOrganizationsCsvPreview(
      organizations
    );

    showMessage(
      messageElement,
      `${organizations.length} organisation(s) valide(s). Le fichier est prêt à être importé.`,
      "success"
    );
  } catch (error) {
    const preview =
      getElement(
        "organizationsCsvPreview"
      );

    if (preview) {
      preview.innerHTML = "";
      preview.classList.add(
        "hidden"
      );
    }

    showMessage(
      messageElement,
      getErrorMessage(
        error,
        "Le fichier CSV est invalide."
      ),
      "error"
    );
  } finally {
    setButtonLoading(
      button,
      false
    );
  }
}

/* ==========================================================
   78. IMPORTATION DU CSV DES ORGANISATIONS
   ========================================================== */

async function handleOrganizationsCsvImport(
  event = null
) {
  /*
   * Correction essentielle :
   * le formulaire ne doit jamais être soumis par le navigateur.
   */
  preventNativeFormSubmission(
    event
  );

  if (
    state.organizationImportInProgress
  ) {
    return;
  }

  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const submitButton =
    getElement(
      "importOrganizationsButton"
    );

  const messageElement =
    getElement(
      "organizationsImportMessage"
    );

  const fileInput =
    getElement(
      "organizationsCsvFile"
    );

  hideMessage(
    messageElement
  );

  if (!fileInput) {
    showMessage(
      messageElement,
      "Le champ de sélection du fichier CSV est introuvable.",
      "error"
    );

    return;
  }

  const file =
    fileInput.files?.[0];

  if (!file) {
    showMessage(
      messageElement,
      "Veuillez sélectionner un fichier CSV avant de lancer l’importation.",
      "error"
    );

    return;
  }

  state.organizationImportInProgress =
    true;

  setButtonLoading(
    submitButton,
    true,
    "Importation..."
  );

  try {
    validateCsvFile(
      file
    );

    const csvText =
      await readCsvFileWithEncoding(
    file
  );

    const {
      rows,
      headers,
    } = parseCsvText(
      csvText
    );

    validateOrganizationsCsvHeaders(
      headers
    );

    const organizations =
      groupOrganizationCsvRows(
        rows
      );

    if (
      organizations.length ===
      0
    ) {
      throw new Error(
        "Aucune organisation valide n’a été détectée dans le fichier CSV."
      );
    }

    renderOrganizationsCsvPreview(
      organizations
    );

    const result =
      await importOrganizations(
        organizations
      );

    await Promise.all([
      loadAdminOrganizations(),
      loadPublicOrganizations(),
    ]);

    fileInput.value = "";

    const preview =
      getElement(
        "organizationsCsvPreview"
      );

    if (preview) {
      preview.innerHTML = "";
      preview.classList.add(
        "hidden"
      );
    }

    showMessage(
      messageElement,
      [
        "Importation terminée avec succès.",
        `${result.created} organisation(s) créée(s).`,
        `${result.updated} organisation(s) mise(s) à jour.`,
        `${result.unchanged} organisation(s) inchangée(s).`,
      ].join(" "),
      "success"
    );

    /*
     * Maintient explicitement l’utilisateur
     * dans Administration > Organisations.
     */
    showView(
      "admin"
    );

    showAdminTab(
      "organizations"
    );
  } catch (error) {
    console.error(
      "Erreur d’importation des organisations :",
      error
    );

    showMessage(
      messageElement,
      getErrorMessage(
        error,
        "Impossible d’importer les organisations."
      ),
      "error"
    );

    showView(
      "admin"
    );

    showAdminTab(
      "organizations"
    );
  } finally {
    state.organizationImportInProgress =
      false;

    setButtonLoading(
      submitButton,
      false
    );
  }
}

/* ==========================================================
   79. IMPORTATION DANS SUPABASE
   ========================================================== */

async function importOrganizations(
  organizations
) {
  if (!state.isAdmin) {
    throw new Error(
      "Seul un administrateur peut importer les organisations."
    );
  }

  const result = {
    created: 0,
    updated: 0,
    unchanged: 0,
  };

  const {
    data: existingOrganizations,
    error: existingError,
  } = await supabase
    .from(
      "organizations"
    )
    .select(`
      id,
      name,
      acronym,
      slug,
      is_active
    `);

  if (existingError) {
    throw new Error(
      `Impossible de lire les organisations existantes : ${existingError.message}`
    );
  }

  const existingByName =
    new Map();

  const existingByAcronym =
    new Map();

  (
    existingOrganizations ||
    []
  ).forEach(
    (organization) => {
      const nameKey =
        normalizeOrganizationKey(
          organization.name
        );

      const acronymKey =
        normalizeOrganizationKey(
          organization.acronym
        );

      if (nameKey) {
        existingByName.set(
          nameKey,
          organization
        );
      }

      if (acronymKey) {
        existingByAcronym.set(
          acronymKey,
          organization
        );
      }
    }
  );

  for (
    const organization
    of organizations
  ) {
    const nameKey =
      normalizeOrganizationKey(
        organization.name
      );

    const acronymKey =
      normalizeOrganizationKey(
        organization.acronym
      );

    const existingByOrganizationName =
      existingByName.get(
        nameKey
      );

    const existingByOrganizationAcronym =
      acronymKey
        ? existingByAcronym.get(
            acronymKey
          )
        : null;

    if (
      existingByOrganizationName &&
      existingByOrganizationAcronym &&
      existingByOrganizationName.id !==
        existingByOrganizationAcronym.id
    ) {
      throw new Error(
        `Conflit pour « ${organization.name} » : le nom et l’acronyme correspondent à deux organisations différentes.`
      );
    }

    const existing =
      existingByOrganizationName ||
      existingByOrganizationAcronym ||
      null;

    const payload = {
      name:
        organization.name.trim(),

      acronym:
        organization.acronym
          ?.trim() ||
        null,

      slug:
        slugify(
          organization.acronym ||
          organization.name
        ),

      is_active:
        Boolean(
          organization.isActive
        ),

      updated_at:
        new Date().toISOString(),
    };

    if (existing) {
      const unchanged =
        normalizeOrganizationKey(
          existing.name
        ) ===
          normalizeOrganizationKey(
            payload.name
          ) &&
        normalizeOrganizationKey(
          existing.acronym
        ) ===
          normalizeOrganizationKey(
            payload.acronym
          ) &&
        Boolean(
          existing.is_active
        ) ===
          Boolean(
            payload.is_active
          ) &&
        String(
          existing.slug || ""
        ) ===
          String(
            payload.slug || ""
          );

      if (unchanged) {
        result.unchanged += 1;
        continue;
      }

      const {
        data: updatedOrganization,
        error: updateError,
      } = await supabase
        .from(
          "organizations"
        )
        .update(
          payload
        )
        .eq(
          "id",
          existing.id
        )
        .select(`
          id,
          name,
          acronym,
          slug,
          is_active
        `)
        .single();

      if (updateError) {
        throw new Error(
          `Impossible de mettre à jour « ${organization.name} » : ${updateError.message}`
        );
      }

      existingByName.set(
        normalizeOrganizationKey(
          updatedOrganization.name
        ),
        updatedOrganization
      );

      const updatedAcronymKey =
        normalizeOrganizationKey(
          updatedOrganization.acronym
        );

      if (updatedAcronymKey) {
        existingByAcronym.set(
          updatedAcronymKey,
          updatedOrganization
        );
      }

      result.updated += 1;

      continue;
    }

    const {
      data: insertedOrganization,
      error: insertError,
    } = await supabase
      .from(
        "organizations"
      )
      .insert({
        ...payload,

        created_at:
          new Date().toISOString(),
      })
      .select(`
        id,
        name,
        acronym,
        slug,
        is_active
      `)
      .single();

    if (insertError) {
      throw new Error(
        `Impossible de créer « ${organization.name} » : ${insertError.message}`
      );
    }

    existingByName.set(
      nameKey,
      insertedOrganization
    );

    if (acronymKey) {
      existingByAcronym.set(
        acronymKey,
        insertedOrganization
      );
    }

    result.created += 1;
  }

  return result;
}

/* ==========================================================
   80. RÉINITIALISATION DE L’IMPORT CSV
   ========================================================== */

function resetOrganizationsCsvImport(
  options = {}
) {
  const {
    preserveMessage = false,
  } = options;

  const form =
    getElement(
      "organizationsCsvForm"
    );

  form?.reset();

  const preview =
    getElement(
      "organizationsCsvPreview"
    );

  if (preview) {
    preview.innerHTML = "";
    preview.classList.add(
      "hidden"
    );
  }

  if (!preserveMessage) {
    hideMessage(
      getElement(
        "organizationsImportMessage"
      )
    );
  }
}

/* ==========================================================
   81. RÉINITIALISATION DE L’APERÇU AU CHANGEMENT DE FICHIER
   ========================================================== */

function handleOrganizationsCsvFileChange() {
  const preview =
    getElement(
      "organizationsCsvPreview"
    );

  if (preview) {
    preview.innerHTML = "";
    preview.classList.add(
      "hidden"
    );
  }

  hideMessage(
    getElement(
      "organizationsImportMessage"
    )
  );
}
/* ==========================================================
   82. CHARGEMENT ADMINISTRATIF DES ALERTES ET COMMUNES
   ========================================================== */

async function loadAdminAlerts() {
  if (!state.isAdmin) {
    state.adminAlerts = [];
    state.adminAlertCommunes = [];
    return;
  }

  const {
    data: alertsData,
    error: alertsError,
  } = await supabase
    .from("alerts")
    .select(`
      id,
      alert_code,
      region,
      is_active,
      created_at,
      updated_at
    `)
    .order(
      "alert_code",
      {
        ascending: false,
      }
    );

  if (alertsError) {
    throw new Error(
      `Impossible de charger les Alertes ID : ${alertsError.message}`
    );
  }

  const {
    data: communesData,
    error: communesError,
  } = await supabase
    .from("alert_communes")
    .select(`
      id,
      alert_id,
      commune,
      is_active,
      created_at,
      updated_at
    `)
    .order(
      "commune",
      {
        ascending: true,
      }
    );

  if (communesError) {
    throw new Error(
      `Impossible de charger les communes : ${communesError.message}`
    );
  }

  state.adminAlertCommunes =
    communesData || [];

  const communesByAlert =
    new Map();

  state.adminAlertCommunes.forEach(
    (communeItem) => {
      if (
        !communesByAlert.has(
          communeItem.alert_id
        )
      ) {
        communesByAlert.set(
          communeItem.alert_id,
          []
        );
      }

      communesByAlert
        .get(
          communeItem.alert_id
        )
        .push(
          communeItem
        );
    }
  );

  state.adminAlerts =
    (alertsData || []).map(
      (alertItem) => ({
        ...alertItem,

        communes:
          communesByAlert.get(
            alertItem.id
          ) || [],
      })
    );

  renderAdminAlerts();
}

/* ==========================================================
   83. AFFICHAGE DES ALERTES DANS LE TABLEAU ADMINISTRATIF
   ========================================================== */

function renderAdminAlerts() {
  const tableBody =
    getElement(
      "adminAlertsTable"
    );

  if (!tableBody) {
    return;
  }

  if (!state.isAdmin) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5">
          Accès administrateur requis.
        </td>
      </tr>
    `;

    return;
  }

  if (
    state.adminAlerts.length ===
    0
  ) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5">
          Aucune Alerte ID enregistrée.
        </td>
      </tr>
    `;

    return;
  }

  tableBody.innerHTML =
    state.adminAlerts
      .map(
        (alertItem) => {
          const activeCommunes =
            alertItem.communes
              .filter(
                (communeItem) =>
                  communeItem.is_active !==
                  false
              )
              .map(
                (communeItem) =>
                  communeItem.commune
              )
              .sort(
                (a, b) =>
                  a.localeCompare(
                    b,
                    "fr",
                    {
                      sensitivity:
                        "base",
                    }
                  )
              );

          const inactiveCommunes =
            alertItem.communes
              .filter(
                (communeItem) =>
                  communeItem.is_active ===
                  false
              )
              .map(
                (communeItem) =>
                  communeItem.commune
              );

          const communesText =
            activeCommunes.length > 0
              ? activeCommunes.join(", ")
              : "Aucune commune active";

          return `
            <tr>
              <td>
                <strong>
                  ${escapeHtml(
                    alertItem.alert_code
                  )}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  alertItem.region ||
                  "—"
                )}
              </td>

              <td>
                <div>
                  ${escapeHtml(
                    communesText
                  )}
                </div>

                ${
                  inactiveCommunes.length > 0
                    ? `
                      <div class="table-subtext">
                        ${inactiveCommunes.length}
                        commune(s) inactive(s)
                      </div>
                    `
                    : ""
                }
              </td>

              <td>
                <span class="status-badge ${
                  alertItem.is_active
                    ? "status-active"
                    : "status-inactive"
                }">
                  ${
                    alertItem.is_active
                      ? "Active"
                      : "Inactive"
                  }
                </span>
              </td>

              <td>
                <div class="table-actions">
                  <button
                    type="button"
                    class="button button-small button-secondary"
                    data-action="edit-alert"
                    data-id="${escapeHtml(
                      alertItem.id
                    )}"
                  >
                    Modifier
                  </button>

                  <button
                    type="button"
                    class="button button-small ${
                      alertItem.is_active
                        ? "button-danger"
                        : "button-primary"
                    }"
                    data-action="toggle-alert"
                    data-id="${escapeHtml(
                      alertItem.id
                    )}"
                  >
                    ${
                      alertItem.is_active
                        ? "Désactiver"
                        : "Activer"
                    }
                  </button>
                </div>
              </td>
            </tr>
          `;
        }
      )
      .join("");
}

/* ==========================================================
   84. ANALYSE D’UNE LISTE DE COMMUNES
   ========================================================== */

function parseCommuneList(value) {
  const communes =
    String(value || "")
      .split(/[,\n;|]+/)
      .map(
        (item) =>
          item.trim()
      )
      .filter(Boolean);

  const uniqueCommunes =
    new Map();

  communes.forEach(
    (commune) => {
      const key =
        normalizeCommuneKey(
          commune
        );

      if (
        key &&
        !uniqueCommunes.has(
          key
        )
      ) {
        uniqueCommunes.set(
          key,
          commune
        );
      }
    }
  );

  return [
    ...uniqueCommunes.values(),
  ].sort(
    (a, b) =>
      a.localeCompare(
        b,
        "fr",
        {
          sensitivity:
            "base",
        }
      )
  );
}

/* ==========================================================
   85. RÉINITIALISATION DU FORMULAIRE ALERTE
   ========================================================== */

function resetAlertForm(
  options = {}
) {
  const {
    preserveMessage = false,
  } = options;

  const form =
    getElement(
      "alertForm"
    );

  form?.reset();

  const alertDatabaseId =
    getElement(
      "alertDatabaseId"
    );

  const communeDatabaseId =
    getElement(
      "alertCommuneDatabaseId"
    );

  const activeCheckbox =
    getElement(
      "alertActive"
    );

  const submitButton =
    getElement(
      "alertSubmitButton"
    );

  if (alertDatabaseId) {
    alertDatabaseId.value = "";
  }

  if (communeDatabaseId) {
    communeDatabaseId.value = "";
  }

  if (activeCheckbox) {
    activeCheckbox.checked =
      true;
  }

  if (submitButton) {
    submitButton.textContent =
      "Enregistrer l’alerte";
  }

  if (!preserveMessage) {
    hideMessage(
      getElement(
        "alertMessage"
      )
    );
  }
}

/* ==========================================================
   86. CHARGEMENT D’UNE ALERTE DANS LE FORMULAIRE
   ========================================================== */

function editAlert(alertId) {
  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const alertItem =
    state.adminAlerts.find(
      (item) =>
        item.id ===
        alertId
    );

  if (!alertItem) {
    window.alert(
      "Alerte introuvable."
    );

    return;
  }

  const activeCommunes =
    alertItem.communes
      .filter(
        (communeItem) =>
          communeItem.is_active !==
          false
      )
      .map(
        (communeItem) =>
          communeItem.commune
      )
      .sort(
        (a, b) =>
          a.localeCompare(
            b,
            "fr",
            {
              sensitivity:
                "base",
            }
          )
      );

  const databaseId =
    getElement(
      "alertDatabaseId"
    );

  const codeInput =
    getElement(
      "alertCode"
    );

  const regionInput =
    getElement(
      "alertRegion"
    );

  const communeInput =
    getElement(
      "alertCommune"
    );

  const activeCheckbox =
    getElement(
      "alertActive"
    );

  const submitButton =
    getElement(
      "alertSubmitButton"
    );

  if (databaseId) {
    databaseId.value =
      alertItem.id;
  }

  if (codeInput) {
    codeInput.value =
      alertItem.alert_code ||
      "";
  }

  if (regionInput) {
    regionInput.value =
      alertItem.region ||
      "";
  }

  if (communeInput) {
    communeInput.value =
      activeCommunes.join(
        "\n"
      );
  }

  if (activeCheckbox) {
    activeCheckbox.checked =
      Boolean(
        alertItem.is_active
      );
  }

  if (submitButton) {
    submitButton.textContent =
      "Mettre à jour l’alerte";
  }

  hideMessage(
    getElement(
      "alertMessage"
    )
  );

  codeInput?.focus();

  getElement(
    "alertForm"
  )?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

/* ==========================================================
   87. RECHERCHE D’UNE ALERTE EXISTANTE
   ========================================================== */

function findExistingAlert({
  alertCode,
  excludeId = "",
}) {
  const alertKey =
    normalizeAlertCodeKey(
      alertCode
    );

  return (
    state.adminAlerts.find(
      (alertItem) => {
        if (
          excludeId &&
          alertItem.id ===
          excludeId
        ) {
          return false;
        }

        return (
          normalizeAlertCodeKey(
            alertItem.alert_code
          ) ===
          alertKey
        );
      }
    ) || null
  );
}

/* ==========================================================
   88. VALIDATION D’UNE ALERTE
   ========================================================== */

function validateAlertInput({
  alertCode,
  region,
  communes,
  excludeId = "",
}) {
  if (!alertCode) {
    throw new Error(
      "L’Alerte ID est obligatoire."
    );
  }

  if (!region) {
    throw new Error(
      "La région est obligatoire."
    );
  }

  if (
    !Array.isArray(
      communes
    ) ||
    communes.length === 0
  ) {
    throw new Error(
      "Veuillez renseigner au moins une commune."
    );
  }

  const duplicate =
    findExistingAlert({
      alertCode,
      excludeId,
    });

  if (duplicate) {
    throw new Error(
      `L’Alerte ID ${duplicate.alert_code} existe déjà.`
    );
  }
}

/* ==========================================================
   89. ENREGISTREMENT MANUEL D’UNE ALERTE
   ========================================================== */

async function handleAlertSubmit(
  event
) {
  preventNativeFormSubmission(
    event
  );

  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const submitButton =
    event?.submitter ||
    getElement(
      "alertSubmitButton"
    );

  const messageElement =
    getElement(
      "alertMessage"
    );

  hideMessage(
    messageElement
  );

  const alertId =
    getElement(
      "alertDatabaseId"
    )?.value || "";

  const alertCode =
    getElement(
      "alertCode"
    )?.value
      .trim() || "";

  const region =
    getElement(
      "alertRegion"
    )?.value
      .trim() || "";

  const communeText =
    getElement(
      "alertCommune"
    )?.value || "";

  const communes =
    parseCommuneList(
      communeText
    );

  const isActive =
    getElement(
      "alertActive"
    )?.checked ??
    true;

  try {
    validateAlertInput({
      alertCode,
      region,
      communes,
      excludeId:
        alertId,
    });
  } catch (error) {
    showMessage(
      messageElement,
      getErrorMessage(
        error,
        "Les informations de l’alerte sont invalides."
      ),
      "error"
    );

    return;
  }

  setButtonLoading(
    submitButton,
    true,
    alertId
      ? "Mise à jour..."
      : "Enregistrement..."
  );

  try {
    let savedAlertId =
      alertId;

    const payload = {
      alert_code:
        alertCode,

      region,

      is_active:
        Boolean(
          isActive
        ),

      updated_at:
        new Date().toISOString(),
    };

    if (alertId) {
      const {
        error,
      } = await supabase
        .from("alerts")
        .update(
          payload
        )
        .eq(
          "id",
          alertId
        );

      if (error) {
        throw error;
      }
    } else {
      const {
        data,
        error,
      } = await supabase
        .from("alerts")
        .insert({
          ...payload,

          created_at:
            new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) {
        throw error;
      }

      savedAlertId =
        data.id;
    }

    await synchronizeAlertCommunes(
      savedAlertId,
      communes
    );

    resetAlertForm({
      preserveMessage:
        true,
    });

    await Promise.all([
      loadAdminAlerts(),
      loadPublicAlerts(),
      loadPublicAlertCommuneOptions(),
    ]);

    refreshDocumentEnrichment();

    showMessage(
      messageElement,
      alertId
        ? "Alerte mise à jour avec succès."
        : "Alerte créée avec succès.",
      "success"
    );

    showView(
      "admin"
    );

    showAdminTab(
      "alerts"
    );
  } catch (error) {
    console.error(
      "Erreur d’enregistrement de l’alerte :",
      error
    );

    showMessage(
      messageElement,
      getErrorMessage(
        error,
        "Impossible d’enregistrer l’alerte."
      ),
      "error"
    );
  } finally {
    setButtonLoading(
      submitButton,
      false
    );
  }
}

/* ==========================================================
   90. SYNCHRONISATION DES COMMUNES D’UNE ALERTE
   ========================================================== */

async function synchronizeAlertCommunes(
  alertId,
  communes
) {
  const {
    data: existingCommunes,
    error: loadError,
  } = await supabase
    .from("alert_communes")
    .select(`
      id,
      alert_id,
      commune,
      is_active
    `)
    .eq(
      "alert_id",
      alertId
    );

  if (loadError) {
    throw new Error(
      `Impossible de lire les communes existantes : ${loadError.message}`
    );
  }

  const requestedCommunes =
    new Map();

  communes.forEach(
    (commune) => {
      requestedCommunes.set(
        normalizeCommuneKey(
          commune
        ),
        commune
      );
    }
  );

  const existingCommunesMap =
    new Map();

  (
    existingCommunes ||
    []
  ).forEach(
    (communeItem) => {
      existingCommunesMap.set(
        normalizeCommuneKey(
          communeItem.commune
        ),
        communeItem
      );
    }
  );

  const rowsToInsert = [];
  const rowsToReactivate = [];
  const rowsToDeactivate = [];

  requestedCommunes.forEach(
    (commune, key) => {
      const existing =
        existingCommunesMap.get(
          key
        );

      if (!existing) {
        rowsToInsert.push({
          alert_id:
            alertId,

          commune,

          is_active:
            true,

          created_at:
            new Date().toISOString(),

          updated_at:
            new Date().toISOString(),
        });

        return;
      }

      if (
        existing.is_active ===
        false ||
        existing.commune !==
        commune
      ) {
        rowsToReactivate.push({
          id:
            existing.id,

          commune,
        });
      }
    }
  );

  existingCommunesMap.forEach(
    (existing, key) => {
      if (
        !requestedCommunes.has(
          key
        ) &&
        existing.is_active !==
          false
      ) {
        rowsToDeactivate.push(
          existing.id
        );
      }
    }
  );

  if (
    rowsToInsert.length > 0
  ) {
    const insertChunks =
      chunkArray(
        rowsToInsert,
        100
      );

    for (
      const rowsChunk
      of insertChunks
    ) {
      const {
        error,
      } = await supabase
        .from("alert_communes")
        .insert(
          rowsChunk
        );

      if (error) {
        throw new Error(
          `Impossible d’ajouter les communes : ${error.message}`
        );
      }
    }
  }

  for (
    const row
    of rowsToReactivate
  ) {
    const {
      error,
    } = await supabase
      .from("alert_communes")
      .update({
        commune:
          row.commune,

        is_active:
          true,

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        row.id
      );

    if (error) {
      throw new Error(
        `Impossible de réactiver la commune « ${row.commune} » : ${error.message}`
      );
    }
  }

  if (
    rowsToDeactivate.length > 0
  ) {
    const deactivateChunks =
      chunkArray(
        rowsToDeactivate,
        100
      );

    for (
      const idsChunk
      of deactivateChunks
    ) {
      const {
        error,
      } = await supabase
        .from("alert_communes")
        .update({
          is_active:
            false,

          updated_at:
            new Date().toISOString(),
        })
        .in(
          "id",
          idsChunk
        );

      if (error) {
        throw new Error(
          `Impossible de désactiver les communes retirées : ${error.message}`
        );
      }
    }
  }
}

/* ==========================================================
   91. ACTIVATION OU DÉSACTIVATION D’UNE ALERTE
   ========================================================== */

async function toggleAlertStatus(
  alertId
) {
  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const alertItem =
    state.adminAlerts.find(
      (item) =>
        item.id ===
        alertId
    );

  if (!alertItem) {
    window.alert(
      "Alerte introuvable."
    );

    return;
  }

  const newStatus =
    !alertItem.is_active;

  const confirmed =
    window.confirm(
      newStatus
        ? `Activer l’Alerte ID « ${alertItem.alert_code} » ?`
        : `Désactiver l’Alerte ID « ${alertItem.alert_code} » ?`
    );

  if (!confirmed) {
    return;
  }

  const {
    error,
  } = await supabase
    .from("alerts")
    .update({
      is_active:
        newStatus,

      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      alertId
    );

  if (error) {
    window.alert(
      `Impossible de modifier le statut de l’alerte : ${error.message}`
    );

    return;
  }

  await Promise.all([
    loadAdminAlerts(),
    loadPublicAlerts(),
    loadPublicAlertCommuneOptions(),
  ]);

  refreshDocumentEnrichment();

  showView(
    "admin"
  );

  showAdminTab(
    "alerts"
  );
}

/* ==========================================================
   92. ACTIONS DU TABLEAU DES ALERTES
   ========================================================== */

function handleAdminAlertTableClick(
  event
) {
  const control =
    event.target.closest(
      "[data-action]"
    );

  if (!control) {
    return;
  }

  preventNativeFormSubmission(
    event
  );

  const alertId =
    control.dataset.id;

  if (!alertId) {
    return;
  }

  switch (
    control.dataset.action
  ) {
    case "edit-alert":
      editAlert(
        alertId
      );
      break;

    case "toggle-alert":
      toggleAlertStatus(
        alertId
      );
      break;

    default:
      console.warn(
        `Action alerte inconnue : ${control.dataset.action}`
      );
      break;
  }
}

/* ==========================================================
   93. VALIDATION DES EN-TÊTES CSV DES ALERTES
   ========================================================== */

function validateAlertCsvHeaders(
  headers
) {
  const headerSet =
    new Set(headers);

  const hasAlertCode =
    [
      "alerte_id",
      "alert_id",
      "alerte",
      "alert_code",
    ].some(
      (header) =>
        headerSet.has(
          header
        )
    );

  const hasRegion =
    headerSet.has(
      "region"
    );

  const hasCommune =
    headerSet.has(
      "commune"
    ) ||
    headerSet.has(
      "communes"
    );

  const missingColumns = [];

  if (!hasAlertCode) {
    missingColumns.push(
      "alerte_id"
    );
  }

  if (!hasRegion) {
    missingColumns.push(
      "region"
    );
  }

  if (!hasCommune) {
    missingColumns.push(
      "commune"
    );
  }

  if (
    missingColumns.length > 0
  ) {
    throw new Error(
      `Colonnes obligatoires manquantes : ${missingColumns.join(", ")}.`
    );
  }
}

/* ==========================================================
   94. NORMALISATION D’UNE LIGNE CSV D’ALERTE
   ========================================================== */

function normalizeAlertCsvRow(
  row
) {
  const alertCode =
    getCsvValue(
      row,
      [
        "alerte_id",
        "Alerte ID",
        "alert_id",
        "Alert ID",
        "alerte",
        "alert_code",
      ]
    );

  const region =
    getCsvValue(
      row,
      [
        "region",
        "Région",
        "Region",
      ]
    );

  const communeValue =
    getCsvValue(
      row,
      [
        "commune",
        "communes",
        "Commune",
        "Communes",
      ]
    );

  return {
    alertCode:
      alertCode.trim(),

    region:
      region.trim(),

    communes:
      parseCommuneList(
        communeValue
      ),

    lineNumber:
      row.__lineNumber,
  };
}

/* ==========================================================
   95. REGROUPEMENT DES ALERTES DU CSV
   ========================================================== */

function groupAlertCsvRows(
  rows
) {
  const groupedAlerts =
    new Map();

  const validationErrors = [];

  rows.forEach(
    (rawRow) => {
      const row =
        normalizeAlertCsvRow(
          rawRow
        );

      const isEmpty =
        !row.alertCode &&
        !row.region &&
        row.communes.length === 0;

      if (isEmpty) {
        return;
      }

      if (!row.alertCode) {
        validationErrors.push(
          `Ligne ${row.lineNumber} : Alerte ID manquante.`
        );

        return;
      }

      if (!row.region) {
        validationErrors.push(
          `Ligne ${row.lineNumber} : région manquante pour ${row.alertCode}.`
        );

        return;
      }

      if (
        row.communes.length === 0
      ) {
        validationErrors.push(
          `Ligne ${row.lineNumber} : commune manquante pour ${row.alertCode}.`
        );

        return;
      }

      const alertKey =
        normalizeAlertCodeKey(
          row.alertCode
        );

      if (
        !groupedAlerts.has(
          alertKey
        )
      ) {
        groupedAlerts.set(
          alertKey,
          {
            alertCode:
              row.alertCode,

            region:
              row.region,

            communes:
              new Map(),

            sourceLines: [],
          }
        );
      }

      const groupedAlert =
        groupedAlerts.get(
          alertKey
        );

      groupedAlert.sourceLines.push(
        row.lineNumber
      );

      if (
        normalizeRegionKey(
          groupedAlert.region
        ) !==
        normalizeRegionKey(
          row.region
        )
      ) {
        validationErrors.push(
          `Ligne ${row.lineNumber} : l’Alerte ID ${row.alertCode} est associée à plusieurs régions.`
        );

        return;
      }

      row.communes.forEach(
        (commune) => {
          groupedAlert.communes.set(
            normalizeCommuneKey(
              commune
            ),
            commune
          );
        }
      );
    }
  );

  if (
    validationErrors.length > 0
  ) {
    const visibleErrors =
      validationErrors
        .slice(0, 15)
        .join("\n");

    const remainingErrors =
      validationErrors.length -
      15;

    throw new Error(
      remainingErrors > 0
        ? `${visibleErrors}\n${remainingErrors} autre(s) erreur(s) non affichée(s).`
        : visibleErrors
    );
  }

  return [
    ...groupedAlerts.values(),
  ].map(
    (item) => ({
      alertCode:
        item.alertCode,

      region:
        item.region,

      communes: [
        ...item.communes.values(),
      ].sort(
        (a, b) =>
          a.localeCompare(
            b,
            "fr",
            {
              sensitivity:
                "base",
            }
          )
      ),

      sourceLines:
        item.sourceLines,
    })
  );
}

/* ==========================================================
   96. LECTURE DU CSV DES ALERTES
   ========================================================== */

async function readAlertCsvFile() {
  const file =
    getElement(
      "alertCsvFile"
    )?.files?.[0];

  if (!file) {
    throw new Error(
      "Veuillez sélectionner le fichier CSV des Alertes ID."
    );
  }

  return readCsvFileWithEncoding(
    file
  );
}

/* ==========================================================
   97. PRÉVISUALISATION DU CSV DES ALERTES
   ========================================================== */

function renderAlertCsvPreview(
  groupedAlerts
) {
  const preview =
    getElement(
      "alertCsvPreview"
    );

  if (!preview) {
    return;
  }

  if (
    groupedAlerts.length ===
    0
  ) {
    preview.innerHTML = `
      <div class="empty-state">
        <h3>
          Aucune Alerte ID valide
        </h3>

        <p>
          Vérifiez le contenu du fichier CSV.
        </p>
      </div>
    `;

    preview.classList.remove(
      "hidden"
    );

    return;
  }

  const totalCommunes =
    groupedAlerts.reduce(
      (
        total,
        alertItem
      ) =>
        total +
        alertItem.communes.length,
      0
    );

  preview.innerHTML = `
    <div class="csv-preview-summary">
      <strong>
        ${groupedAlerts.length}
        Alerte${
          groupedAlerts.length > 1
            ? "s"
            : ""
        } ID
      </strong>

      <span>
        ${totalCommunes}
        commune${
          totalCommunes > 1
            ? "s"
            : ""
        }
      </span>
    </div>

    <div class="table-card">
      <table>
        <thead>
          <tr>
            <th>Alerte ID</th>
            <th>Région</th>
            <th>Commune(s)</th>
          </tr>
        </thead>

        <tbody>
          ${groupedAlerts
            .slice(0, 20)
            .map(
              (alertItem) => `
                <tr>
                  <td>
                    ${escapeHtml(
                      alertItem.alertCode
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      alertItem.region
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      alertItem.communes.join(
                        ", "
                      )
                    )}
                  </td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>

    ${
      groupedAlerts.length > 20
        ? `
          <p class="helper-text">
            Aperçu limité aux 20 premières Alertes ID.
          </p>
        `
        : ""
    }
  `;

  preview.classList.remove(
    "hidden"
  );
}

/* ==========================================================
   98. TRAITEMENT DE LA PRÉVISUALISATION DES ALERTES
   ========================================================== */

async function handleAlertCsvPreview(
  event
) {
  preventNativeFormSubmission(
    event
  );

  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const button =
    getElement(
      "alertCsvPreviewButton"
    );

  const messageElement =
    getElement(
      "alertCsvMessage"
    );

  hideMessage(
    messageElement
  );

  setButtonLoading(
    button,
    true,
    "Analyse..."
  );

  try {
    const csvText =
      await readAlertCsvFile();

    const {
      rows,
      headers,
    } = parseCsvText(
      csvText
    );

    validateAlertCsvHeaders(
      headers
    );

    const groupedAlerts =
      groupAlertCsvRows(
        rows
      );

    renderAlertCsvPreview(
      groupedAlerts
    );

    showMessage(
      messageElement,
      `${groupedAlerts.length} Alerte(s) ID valide(s). Le fichier est prêt à être importé.`,
      "success"
    );
  } catch (error) {
    const preview =
      getElement(
        "alertCsvPreview"
      );

    if (preview) {
      preview.innerHTML = "";
      preview.classList.add(
        "hidden"
      );
    }

    showMessage(
      messageElement,
      getErrorMessage(
        error,
        "Le fichier CSV est invalide."
      ),
      "error"
    );
  } finally {
    setButtonLoading(
      button,
      false
    );
  }
}

/* ==========================================================
   99. IMPORTATION DU CSV DES ALERTES
   ========================================================== */

async function handleAlertCsvImport(
  event
) {
  preventNativeFormSubmission(
    event
  );

  if (
    state.alertImportInProgress
  ) {
    return;
  }

  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const submitButton =
    event?.submitter ||
    getElement(
      "alertCsvImportButton"
    );

  const messageElement =
    getElement(
      "alertCsvMessage"
    );

  hideMessage(
    messageElement
  );

  state.alertImportInProgress =
    true;

  setButtonLoading(
    submitButton,
    true,
    "Importation..."
  );

  try {
    const csvText =
      await readAlertCsvFile();

    const {
      rows,
      headers,
    } = parseCsvText(
      csvText
    );

    validateAlertCsvHeaders(
      headers
    );

    const groupedAlerts =
      groupAlertCsvRows(
        rows
      );

    if (
      groupedAlerts.length ===
      0
    ) {
      throw new Error(
        "Aucune Alerte ID valide n’a été trouvée dans le fichier."
      );
    }

    renderAlertCsvPreview(
      groupedAlerts
    );

    const result =
      await importGroupedAlerts(
        groupedAlerts
      );

    resetAlertCsvImport({
      preserveMessage:
        true,
    });

    await Promise.all([
      loadAdminAlerts(),
      loadPublicAlerts(),
      loadPublicAlertCommuneOptions(),
    ]);

    refreshDocumentEnrichment();

    showMessage(
      messageElement,
      [
        "Import terminé.",
        `${result.createdAlerts} alerte(s) créée(s).`,
        `${result.updatedAlerts} alerte(s) mise(s) à jour.`,
        `${result.unchangedAlerts} alerte(s) inchangée(s).`,
        `${result.createdCommunes} commune(s) créée(s).`,
        `${result.reactivatedCommunes} commune(s) réactivée(s).`,
        `${result.unchangedCommunes} commune(s) déjà présente(s).`,
      ].join(" "),
      "success"
    );

    showView(
      "admin"
    );

    showAdminTab(
      "alerts"
    );
  } catch (error) {
    console.error(
      "Erreur lors de l’importation des Alertes ID :",
      error
    );

    showMessage(
      messageElement,
      getErrorMessage(
        error,
        "Impossible d’importer les Alertes ID."
      ),
      "error"
    );

    showView(
      "admin"
    );

    showAdminTab(
      "alerts"
    );
  } finally {
    state.alertImportInProgress =
      false;

    setButtonLoading(
      submitButton,
      false
    );
  }
}

/* ==========================================================
   100. CRÉATION ET MISE À JOUR DES ALERTES IMPORTÉES
   ========================================================== */

async function importGroupedAlerts(
  groupedAlerts
) {
  const result = {
    createdAlerts: 0,
    updatedAlerts: 0,
    unchangedAlerts: 0,
    createdCommunes: 0,
    reactivatedCommunes: 0,
    unchangedCommunes: 0,
  };

  const {
    data: existingAlerts,
    error: existingAlertsError,
  } = await supabase
    .from("alerts")
    .select(`
      id,
      alert_code,
      region,
      is_active
    `);

  if (existingAlertsError) {
    throw new Error(
      `Impossible de vérifier les Alertes ID existantes : ${existingAlertsError.message}`
    );
  }

  const existingAlertsMap =
    new Map(
      (
        existingAlerts ||
        []
      ).map(
        (item) => [
          normalizeAlertCodeKey(
            item.alert_code
          ),
          item,
        ]
      )
    );

  for (
    const groupedAlert
    of groupedAlerts
  ) {
    const alertKey =
      normalizeAlertCodeKey(
        groupedAlert.alertCode
      );

    let existingAlert =
      existingAlertsMap.get(
        alertKey
      );

    let alertId = "";

    if (!existingAlert) {
      const {
        data,
        error,
      } = await supabase
        .from("alerts")
        .insert({
          alert_code:
            groupedAlert.alertCode,

          region:
            groupedAlert.region,

          is_active:
            true,

          created_at:
            new Date().toISOString(),

          updated_at:
            new Date().toISOString(),
        })
        .select(`
          id,
          alert_code,
          region,
          is_active
        `)
        .single();

      if (error) {
        throw new Error(
          `Impossible de créer l’Alerte ID ${groupedAlert.alertCode} : ${error.message}`
        );
      }

      existingAlert = data;

      alertId =
        data.id;

      existingAlertsMap.set(
        alertKey,
        data
      );

      result.createdAlerts +=
        1;
    } else {
      alertId =
        existingAlert.id;

      const regionChanged =
        normalizeRegionKey(
          existingAlert.region
        ) !==
        normalizeRegionKey(
          groupedAlert.region
        );

      const statusChanged =
        existingAlert.is_active ===
        false;

      if (
        regionChanged ||
        statusChanged
      ) {
        const {
          error,
        } = await supabase
          .from("alerts")
          .update({
            region:
              groupedAlert.region,

            is_active:
              true,

            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            alertId
          );

        if (error) {
          throw new Error(
            `Impossible de mettre à jour l’Alerte ID ${groupedAlert.alertCode} : ${error.message}`
          );
        }

        result.updatedAlerts +=
          1;
      } else {
        result.unchangedAlerts +=
          1;
      }
    }

    const communeResult =
      await importAlertCommunes(
        alertId,
        groupedAlert.communes
      );

    result.createdCommunes +=
      communeResult.created;

    result.reactivatedCommunes +=
      communeResult.reactivated;

    result.unchangedCommunes +=
      communeResult.unchanged;
  }

  return result;
}

/* ==========================================================
   101. IMPORTATION DES COMMUNES D’UNE ALERTE
   ========================================================== */

async function importAlertCommunes(
  alertId,
  communes
) {
  const result = {
    created: 0,
    reactivated: 0,
    unchanged: 0,
  };

  const {
    data: existingCommunes,
    error: loadError,
  } = await supabase
    .from("alert_communes")
    .select(`
      id,
      commune,
      is_active
    `)
    .eq(
      "alert_id",
      alertId
    );

  if (loadError) {
    throw new Error(
      `Impossible de vérifier les communes existantes : ${loadError.message}`
    );
  }

  const existingMap =
    new Map(
      (
        existingCommunes ||
        []
      ).map(
        (item) => [
          normalizeCommuneKey(
            item.commune
          ),
          item,
        ]
      )
    );

  const rowsToInsert = [];

  for (
    const commune
    of communes
  ) {
    const communeKey =
      normalizeCommuneKey(
        commune
      );

    const existing =
      existingMap.get(
        communeKey
      );

    if (!existing) {
      rowsToInsert.push({
        alert_id:
          alertId,

        commune,

        is_active:
          true,

        created_at:
          new Date().toISOString(),

        updated_at:
          new Date().toISOString(),
      });

      continue;
    }

    if (
      existing.is_active ===
      false
    ) {
      const {
        error,
      } = await supabase
        .from("alert_communes")
        .update({
          commune,

          is_active:
            true,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          existing.id
        );

      if (error) {
        throw new Error(
          `Impossible de réactiver la commune « ${commune} » : ${error.message}`
        );
      }

      result.reactivated +=
        1;
    } else {
      result.unchanged +=
        1;
    }
  }

  if (
    rowsToInsert.length > 0
  ) {
    const chunks =
      chunkArray(
        rowsToInsert,
        100
      );

    for (
      const rowsChunk
      of chunks
    ) {
      const {
        error,
      } = await supabase
        .from("alert_communes")
        .insert(
          rowsChunk
        );

      if (error) {
        throw new Error(
          `Impossible d’ajouter les communes : ${error.message}`
        );
      }
    }

    result.created +=
      rowsToInsert.length;
  }

  return result;
}

/* ==========================================================
   102. RÉINITIALISATION DE L’IMPORT CSV DES ALERTES
   ========================================================== */

function resetAlertCsvImport(
  options = {}
) {
  const {
    preserveMessage = false,
  } = options;

  getElement(
    "alertCsvForm"
  )?.reset();

  const preview =
    getElement(
      "alertCsvPreview"
    );

  if (preview) {
    preview.innerHTML = "";
    preview.classList.add(
      "hidden"
    );
  }

  if (!preserveMessage) {
    hideMessage(
      getElement(
        "alertCsvMessage"
      )
    );
  }
}

function handleAlertCsvFileChange() {
  const preview =
    getElement(
      "alertCsvPreview"
    );

  if (preview) {
    preview.innerHTML = "";
    preview.classList.add(
      "hidden"
    );
  }

  hideMessage(
    getElement(
      "alertCsvMessage"
    )
  );
}

/* ==========================================================
   103. LIBELLÉS DES STATUTS DES DOCUMENTS
   ========================================================== */

function getDocumentStatusLabel(
  status
) {
  const labels = {
    published:
      "Publié",

    draft:
      "Brouillon",

    archived:
      "Archivé",
  };

  return (
    labels[status] ||
    status ||
    "Non défini"
  );
}

function getDocumentStatusClass(
  status
) {
  const classes = {
    published:
      "status-active",

    draft:
      "status-pending",

    archived:
      "status-inactive",
  };

  return (
    classes[status] ||
    "status-inactive"
  );
}

/* ==========================================================
   104. AFFICHAGE ADMINISTRATIF DES DOCUMENTS
   ========================================================== */

function renderAdminDocuments() {
  const tableBody =
    getElement(
      "adminDocumentsTable"
    );

  if (!tableBody) {
    return;
  }

  if (!state.isAdmin) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8">
          Accès administrateur requis.
        </td>
      </tr>
    `;

    return;
  }

  if (
    state.documents.length ===
    0
  ) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8">
          Aucun document enregistré.
        </td>
      </tr>
    `;

    return;
  }

  tableBody.innerHTML =
    state.documents
      .map(
        (documentItem) => {
          const publicUrl =
            getPublicUrl(
              documentItem.storage_path
            );

          const status =
            documentItem.publication_status ||
            "published";

          return `
            <tr>
              <td>
                <strong>
                  ${escapeHtml(
                    documentItem.file_name ||
                    "Document PDF"
                  )}
                </strong>

                <div class="table-subtext">
                  ${formatFileSize(
                    documentItem.file_size
                  )}
                </div>
              </td>

              <td>
                ${escapeHtml(
                  documentItem.organization_name ||
                  "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  documentItem.alert_code ||
                  "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  documentItem.region ||
                  "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  documentItem.commune ||
                  "—"
                )}
              </td>

              <td>
                <span class="status-badge ${
                  getDocumentStatusClass(
                    status
                  )
                }">
                  ${escapeHtml(
                    getDocumentStatusLabel(
                      status
                    )
                  )}
                </span>
              </td>

              <td>
                ${formatDate(
                  documentItem.created_at
                )}
              </td>

              <td>
                <div class="table-actions">
                  ${
                    publicUrl
                      ? `
                        <a
                          class="button button-small button-secondary"
                          href="${escapeHtml(
                            publicUrl
                          )}"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Ouvrir
                        </a>
                      `
                      : ""
                  }

                  <button
                    type="button"
                    class="button button-small button-secondary"
                    data-action="replace-document"
                    data-id="${escapeHtml(
                      documentItem.id
                    )}"
                  >
                    Remplacer
                  </button>

                  <button
                    type="button"
                    class="button button-small button-secondary"
                    data-action="change-document-status"
                    data-id="${escapeHtml(
                      documentItem.id
                    )}"
                  >
                    Statut
                  </button>

                  <button
                    type="button"
                    class="button button-small button-danger"
                    data-action="delete-document"
                    data-id="${escapeHtml(
                      documentItem.id
                    )}"
                  >
                    Supprimer
                  </button>
                </div>
              </td>
            </tr>
          `;
        }
      )
      .join("");
}

/* ==========================================================
   105. MODIFICATION DU STATUT D’UN DOCUMENT
   ========================================================== */

async function changeDocumentStatus(
  documentId
) {
  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const documentItem =
    state.documents.find(
      (item) =>
        item.id ===
        documentId
    );

  if (!documentItem) {
    window.alert(
      "Document introuvable."
    );

    return;
  }

  const currentStatus =
    documentItem.publication_status ||
    "published";

  const requestedStatus =
    window.prompt(
      [
        "Nouveau statut :",
        "published = publié",
        "draft = brouillon",
        "archived = archivé",
      ].join("\n"),
      currentStatus
    );

  if (
    requestedStatus ===
    null
  ) {
    return;
  }

  const normalizedStatus =
    requestedStatus
      .trim()
      .toLowerCase();

  const allowedStatuses = [
    "published",
    "draft",
    "archived",
  ];

  if (
    !allowedStatuses.includes(
      normalizedStatus
    )
  ) {
    window.alert(
      "Statut invalide. Utilisez published, draft ou archived."
    );

    return;
  }

  if (
    normalizedStatus ===
    currentStatus
  ) {
    return;
  }

  const {
    error,
  } = await supabase
    .from("documents")
    .update({
      publication_status:
        normalizedStatus,

      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      documentId
    );

  if (error) {
    window.alert(
      `Impossible de modifier le statut : ${error.message}`
    );

    return;
  }

  await loadDocuments();

  showView(
    "admin"
  );

  showAdminTab(
    "documents"
  );
}

/* ==========================================================
   106. SÉLECTION DU FICHIER DE REMPLACEMENT
   ========================================================== */

function requestDocumentReplacement(
  documentId
) {
  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const documentItem =
    state.documents.find(
      (item) =>
        item.id ===
        documentId
    );

  if (!documentItem) {
    window.alert(
      "Document introuvable."
    );

    return;
  }

  let fileInput =
    getElement(
      "documentReplacementFile"
    );

  if (!fileInput) {
    fileInput =
      document.createElement(
        "input"
      );

    fileInput.id =
      "documentReplacementFile";

    fileInput.type =
      "file";

    fileInput.accept =
      ".pdf,application/pdf";

    fileInput.className =
      "hidden";

    document.body.appendChild(
      fileInput
    );

    fileInput.addEventListener(
      "change",
      handleDocumentReplacementFileChange
    );
  }

  fileInput.dataset.documentId =
    documentId;

  fileInput.value = "";

  fileInput.click();
}

/* ==========================================================
   107. TRAITEMENT DU FICHIER DE REMPLACEMENT
   ========================================================== */

async function handleDocumentReplacementFileChange(
  event
) {
  const fileInput =
    event.currentTarget;

  const documentId =
    fileInput.dataset.documentId;

  const file =
    fileInput.files?.[0];

  if (
    !documentId ||
    !file
  ) {
    return;
  }

  try {
    validatePdf(
      file
    );
  } catch (error) {
    window.alert(
      getErrorMessage(
        error,
        "Le fichier sélectionné est invalide."
      )
    );

    fileInput.value = "";

    return;
  }

  const documentItem =
    state.documents.find(
      (item) =>
        item.id ===
        documentId
    );

  if (!documentItem) {
    window.alert(
      "Document introuvable."
    );

    fileInput.value = "";

    return;
  }

  const confirmed =
    window.confirm(
      `Remplacer « ${documentItem.file_name} » par « ${file.name} » ?`
    );

  if (!confirmed) {
    fileInput.value = "";
    return;
  }

  await replaceDocumentFile(
    documentItem,
    file
  );

  fileInput.value = "";
}

/* ==========================================================
   108. REMPLACEMENT DU DOCUMENT
   ========================================================== */

async function replaceDocumentFile(
  documentItem,
  file
) {
  const organization =
    getOrganizationById(
      documentItem.organization_id
    ) || {
      name:
        documentItem.organization_name ||
        "organisation",

      acronym:
        "",
    };

  const alertOption =
    getAlertById(
      documentItem.alert_id
    ) || {
      alert_code:
        documentItem.alert_code ||
        "alerte",
    };

  const communeOption =
    getAlertCommuneById(
      documentItem.alert_commune_id
    ) || {
      commune:
        documentItem.commune ||
        "commune",
    };

  const newStoragePath =
    buildDocumentStoragePath({
      organization,
      alertOption,
      communeOption,
      file,
    });

  let newFileUploaded =
    false;

  try {
    const {
      error: uploadError,
    } = await supabase.storage
      .from(
        CONFIG.STORAGE_BUCKET
      )
      .upload(
        newStoragePath,
        file,
        {
          cacheControl:
            CONFIG.STORAGE_CACHE_CONTROL ||
            "3600",

          contentType:
            "application/pdf",

          upsert:
            false,
        }
      );

    if (uploadError) {
      throw new Error(
        `Chargement du nouveau fichier impossible : ${uploadError.message}`
      );
    }

    newFileUploaded =
      true;

    const {
      error: updateError,
    } = await supabase
      .from("documents")
      .update({
        file_name:
          file.name,

        storage_path:
          newStoragePath,

        file_size:
          file.size,

        mime_type:
          "application/pdf",

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        documentItem.id
      );

    if (updateError) {
      throw new Error(
        `Mise à jour du document impossible : ${updateError.message}`
      );
    }

    if (
      documentItem.storage_path &&
      documentItem.storage_path !==
        newStoragePath
    ) {
      const {
        error: oldFileError,
      } = await supabase.storage
        .from(
          CONFIG.STORAGE_BUCKET
        )
        .remove([
          documentItem.storage_path,
        ]);

      if (oldFileError) {
        console.warn(
          "L’ancien fichier n’a pas pu être supprimé :",
          oldFileError
        );
      }
    }

    newFileUploaded =
      false;

    window.alert(
      "Le document a été remplacé avec succès."
    );

    await loadDocuments();

    showView(
      "admin"
    );

    showAdminTab(
      "documents"
    );
  } catch (error) {
    if (newFileUploaded) {
      const {
        error: cleanupError,
      } = await supabase.storage
        .from(
          CONFIG.STORAGE_BUCKET
        )
        .remove([
          newStoragePath,
        ]);

      if (cleanupError) {
        console.warn(
          "Le nouveau fichier n’a pas pu être supprimé après l’échec :",
          cleanupError
        );
      }
    }

    window.alert(
      getErrorMessage(
        error,
        "Impossible de remplacer le document."
      )
    );
  }
}

/* ==========================================================
   109. SUPPRESSION D’UN DOCUMENT
   ========================================================== */

async function deleteDocument(
  documentId
) {
  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const documentItem =
    state.documents.find(
      (item) =>
        item.id ===
        documentId
    );

  if (!documentItem) {
    window.alert(
      "Document introuvable."
    );

    return;
  }

  const confirmed =
    window.confirm(
      [
        `Supprimer définitivement « ${documentItem.file_name} » ?`,
        "",
        "Cette opération supprimera la fiche et le fichier PDF.",
      ].join("\n")
    );

  if (!confirmed) {
    return;
  }

  const {
    error: deleteError,
  } = await supabase
    .from("documents")
    .delete()
    .eq(
      "id",
      documentId
    );

  if (deleteError) {
    window.alert(
      `Impossible de supprimer la fiche : ${deleteError.message}`
    );

    return;
  }

  if (
    documentItem.storage_path
  ) {
    const {
      error: storageError,
    } = await supabase.storage
      .from(
        CONFIG.STORAGE_BUCKET
      )
      .remove([
        documentItem.storage_path,
      ]);

    if (storageError) {
      console.warn(
        "La fiche a été supprimée, mais le fichier est resté dans Storage :",
        storageError
      );

      window.alert(
        "La fiche a été supprimée, mais le fichier doit être retiré manuellement de Supabase Storage."
      );
    } else {
      window.alert(
        "Le document a été supprimé avec succès."
      );
    }
  } else {
    window.alert(
      "Le document a été supprimé avec succès."
    );
  }

  await loadDocuments();

  showView(
    "admin"
  );

  showAdminTab(
    "documents"
  );
}

/* ==========================================================
   110. ACTIONS DU TABLEAU DES DOCUMENTS
   ========================================================== */

function handleAdminDocumentTableClick(
  event
) {
  const control =
    event.target.closest(
      "[data-action]"
    );

  if (!control) {
    return;
  }

  preventNativeFormSubmission(
    event
  );

  const documentId =
    control.dataset.id;

  if (!documentId) {
    return;
  }

  switch (
    control.dataset.action
  ) {
    case "replace-document":
      requestDocumentReplacement(
        documentId
      );
      break;

    case "change-document-status":
      changeDocumentStatus(
        documentId
      );
      break;

    case "delete-document":
      deleteDocument(
        documentId
      );
      break;

    default:
      console.warn(
        `Action document inconnue : ${control.dataset.action}`
      );
      break;
  }
}
/* ==========================================================
   111. INITIALISATION DES ÉVÉNEMENTS
   ========================================================== */

function initializeEvents() {
  if (state.eventsInitialized) {
    return;
  }

  state.eventsInitialized = true;

  initializeNavigation();
  initializeAdminTabs();

  /* --------------------------------------------------------
     Authentification
     -------------------------------------------------------- */

  getElement(
    "loginButton"
  )?.addEventListener(
    "click",
    (event) => {
      preventNativeFormSubmission(
        event
      );

      openLoginModal();
    }
  );

  getElement(
    "logoutButton"
  )?.addEventListener(
    "click",
    handleLogout
  );

  getElement(
    "closeLoginModal"
  )?.addEventListener(
    "click",
    (event) => {
      preventNativeFormSubmission(
        event
      );

      closeLoginModal();
    }
  );

  getElement(
    "cancelLoginButton"
  )?.addEventListener(
    "click",
    (event) => {
      preventNativeFormSubmission(
        event
      );

      closeLoginModal();
    }
  );

  getElement(
    "loginForm"
  )?.addEventListener(
    "submit",
    handleAdminLogin
  );

  getElement(
    "loginModal"
  )?.addEventListener(
    "click",
    (event) => {
      if (
        event.target.classList.contains(
          "modal-backdrop"
        )
      ) {
        closeLoginModal();
      }
    }
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Escape"
      ) {
        closeLoginModal();
      }
    }
  );

  /* --------------------------------------------------------
     Publication publique
     -------------------------------------------------------- */

  getElement(
    "publishOrganization"
  )?.addEventListener(
    "change",
    handlePublishOrganizationChange
  );

  getElement(
    "publishAlert"
  )?.addEventListener(
    "change",
    handlePublishAlertChange
  );

  getElement(
    "publishCommune"
  )?.addEventListener(
    "change",
    handlePublishCommuneChange
  );

  getElement(
    "publishFile"
  )?.addEventListener(
    "change",
    handlePublishFileChange
  );

  getElement(
    "publishForm"
  )?.addEventListener(
    "submit",
    handlePublicPublication
  );

  getElement(
    "resetPublishButton"
  )?.addEventListener(
    "click",
    (event) => {
      preventNativeFormSubmission(
        event
      );

      resetPublishForm();
    }
  );

  /* --------------------------------------------------------
     Recherche et filtres documentaires
     -------------------------------------------------------- */

  getElement(
    "documentSearch"
  )?.addEventListener(
    "input",
    renderDocuments
  );

  getElement(
    "filterOrganization"
  )?.addEventListener(
    "change",
    renderDocuments
  );

  getElement(
    "filterAlert"
  )?.addEventListener(
    "change",
    renderDocuments
  );

  getElement(
    "filterCommune"
  )?.addEventListener(
    "change",
    renderDocuments
  );

  getElement(
    "resetFiltersButton"
  )?.addEventListener(
    "click",
    resetDocumentFilters
  );

  getElement(
    "refreshDocumentsButton"
  )?.addEventListener(
    "click",
    refreshDocuments
  );

  /* --------------------------------------------------------
     Administration manuelle des organisations
     -------------------------------------------------------- */

  getElement(
    "organizationForm"
  )?.addEventListener(
    "submit",
    handleOrganizationSubmit
  );

  getElement(
    "resetOrganizationButton"
  )?.addEventListener(
    "click",
    (event) => {
      preventNativeFormSubmission(
        event
      );

      resetOrganizationForm();
    }
  );

  getElement(
    "adminOrganizationsTable"
  )?.addEventListener(
    "click",
    handleAdminOrganizationTableClick
  );

  /* --------------------------------------------------------
     Import CSV des organisations
     -------------------------------------------------------- */

  const organizationsCsvForm =
    getElement(
      "organizationsCsvForm"
    );

  organizationsCsvForm?.addEventListener(
    "submit",
    (event) => {
      preventNativeFormSubmission(
        event
      );
    }
  );

  getElement(
    "importOrganizationsButton"
  )?.addEventListener(
    "click",
    handleOrganizationsCsvImport
  );

  getElement(
    "organizationsCsvPreviewButton"
  )?.addEventListener(
    "click",
    handleOrganizationsCsvPreview
  );

  getElement(
    "resetOrganizationsCsvButton"
  )?.addEventListener(
    "click",
    (event) => {
      preventNativeFormSubmission(
        event
      );

      resetOrganizationsCsvImport();
    }
  );

  getElement(
    "organizationsCsvFile"
  )?.addEventListener(
    "change",
    handleOrganizationsCsvFileChange
  );

  /* --------------------------------------------------------
     Administration manuelle des Alertes ID
     -------------------------------------------------------- */

  getElement(
    "alertForm"
  )?.addEventListener(
    "submit",
    handleAlertSubmit
  );

  getElement(
    "resetAlertButton"
  )?.addEventListener(
    "click",
    (event) => {
      preventNativeFormSubmission(
        event
      );

      resetAlertForm();
    }
  );

  getElement(
    "adminAlertsTable"
  )?.addEventListener(
    "click",
    handleAdminAlertTableClick
  );

  /* --------------------------------------------------------
     Import CSV des Alertes ID
     -------------------------------------------------------- */

  getElement(
    "alertCsvForm"
  )?.addEventListener(
    "submit",
    handleAlertCsvImport
  );

  getElement(
    "alertCsvPreviewButton"
  )?.addEventListener(
    "click",
    handleAlertCsvPreview
  );

  getElement(
    "resetAlertCsvButton"
  )?.addEventListener(
    "click",
    (event) => {
      preventNativeFormSubmission(
        event
      );

      resetAlertCsvImport();
    }
  );

  getElement(
    "alertCsvFile"
  )?.addEventListener(
    "change",
    handleAlertCsvFileChange
  );

  /* --------------------------------------------------------
     Administration des documents
     -------------------------------------------------------- */

  getElement(
    "adminDocumentsTable"
  )?.addEventListener(
    "click",
    handleAdminDocumentTableClick
  );

  /* --------------------------------------------------------
     Actualisation administrative
     -------------------------------------------------------- */

  getElement(
    "refreshAdminButton"
  )?.addEventListener(
    "click",
    refreshAdminData
  );
}

/* ==========================================================
   112. ACTUALISATION DE L’ADMINISTRATION
   ========================================================== */

async function refreshAdminData(
  event
) {
  preventNativeFormSubmission(
    event
  );

  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const button =
    getElement(
      "refreshAdminButton"
    );

  const messageElement =
    getElement(
      "adminGlobalMessage"
    );

  hideMessage(
    messageElement
  );

  setButtonLoading(
    button,
    true,
    "Actualisation..."
  );

  try {
    await refreshApplicationData();

    showMessage(
      messageElement,
      "Les données ont été actualisées avec succès.",
      "success"
    );
  } catch (error) {
    console.error(
      "Erreur d’actualisation administrative :",
      error
    );

    showMessage(
      messageElement,
      getErrorMessage(
        error,
        "Impossible d’actualiser les données."
      ),
      "error"
    );
  } finally {
    setButtonLoading(
      button,
      false
    );
  }
}

/* ==========================================================
   113. ACTUALISATION GLOBALE DE L’APPLICATION
   ========================================================== */

async function refreshApplicationData() {
  const referenceErrors =
    await loadPublicReferenceData();

  await loadDocuments();

  if (state.isAdmin) {
    await loadAdminData();

    refreshDocumentEnrichment();
  }

  updatePublishSummary();

  if (
    referenceErrors.length > 0
  ) {
    throw new Error(
      referenceErrors
        .map(
          (error) =>
            getErrorMessage(
              error,
              "Erreur de chargement du référentiel."
            )
        )
        .join(" ")
    );
  }
}

/* ==========================================================
   114. ÉTAT DE CHARGEMENT INITIAL
   ========================================================== */

function setInitialLoadingState(
  isLoading
) {
  const loadingElement =
    getElement(
      "applicationLoading"
    );

  const applicationElement =
    getElement(
      "applicationContent"
    );

  if (loadingElement) {
    loadingElement.classList.toggle(
      "hidden",
      !isLoading
    );
  }

  if (applicationElement) {
    applicationElement.classList.toggle(
      "hidden",
      isLoading
    );
  }
}

/* ==========================================================
   115. AFFICHAGE D’UNE ERREUR D’INITIALISATION
   ========================================================== */

function showInitializationError(
  error
) {
  console.error(
    "Erreur d’initialisation de l’application :",
    error
  );

  const errorContainer =
    getElement(
      "applicationError"
    );

  const message =
    getErrorMessage(
      error,
      "Impossible de démarrer l’application."
    );

  if (!errorContainer) {
    window.alert(
      message
    );

    return;
  }

  errorContainer.innerHTML = `
    <div class="message message-error">
      <strong>
        Une partie du portail n’a pas pu être chargée.
      </strong>

      <p>
        ${escapeHtml(
          message
        )}
      </p>

      <button
        type="button"
        class="button button-primary"
        id="retryInitializationButton"
      >
        Réessayer
      </button>
    </div>
  `;

  errorContainer.classList.remove(
    "hidden"
  );

  getElement(
    "retryInitializationButton"
  )?.addEventListener(
    "click",
    (event) => {
      preventNativeFormSubmission(
        event
      );

      window.location.reload();
    }
  );
}

/* ==========================================================
   116. EFFACEMENT DES ERREURS D’INITIALISATION
   ========================================================== */

function clearInitializationError() {
  const errorContainer =
    getElement(
      "applicationError"
    );

  if (!errorContainer) {
    return;
  }

  errorContainer.innerHTML = "";

  errorContainer.classList.add(
    "hidden"
  );
}

/* ==========================================================
   117. VALIDATION DE LA CONFIGURATION
   ========================================================== */

function validateConfiguration() {
  const missingValues = [];

  if (
    !CONFIG.SUPABASE_URL ||
    String(
      CONFIG.SUPABASE_URL
    ).includes(
      "VOTRE-PROJET"
    )
  ) {
    missingValues.push(
      "SUPABASE_URL"
    );
  }

  if (
    !CONFIG.SUPABASE_PUBLISHABLE_KEY ||
    String(
      CONFIG.SUPABASE_PUBLISHABLE_KEY
    ).includes(
      "VOTRE_CLE"
    )
  ) {
    missingValues.push(
      "SUPABASE_PUBLISHABLE_KEY"
    );
  }

  if (
    !CONFIG.STORAGE_BUCKET
  ) {
    missingValues.push(
      "STORAGE_BUCKET"
    );
  }

  if (
    missingValues.length > 0
  ) {
    throw new Error(
      `Configuration incomplète : ${missingValues.join(", ")}.`
    );
  }

  if (
    !String(
      CONFIG.SUPABASE_URL
    ).startsWith(
      "https://"
    )
  ) {
    throw new Error(
      "L’URL Supabase doit commencer par https://."
    );
  }

  const publicKey =
    String(
      CONFIG.SUPABASE_PUBLISHABLE_KEY
    );

  if (
    publicKey.startsWith(
      "sb_secret_"
    ) ||
    publicKey.includes(
      "service_role"
    )
  ) {
    throw new Error(
      "Une clé secrète Supabase ne doit jamais être utilisée dans config.js."
    );
  }

  const maximumFileSize =
    Number(
      CONFIG.MAX_FILE_SIZE
    );

  if (
    !Number.isFinite(
      maximumFileSize
    ) ||
    maximumFileSize <= 0
  ) {
    throw new Error(
      "La valeur CONFIG.MAX_FILE_SIZE est invalide."
    );
  }
}

/* ==========================================================
   118. VÉRIFICATION DES ÉLÉMENTS HTML ESSENTIELS
   ========================================================== */

function validateRequiredInterfaceElements() {
  const requiredElementIds = [
    "applicationLoading",
    "applicationContent",
    "homeView",
    "documentsView",
    "publishView",
    "adminView",
    "loginButton",
    "logoutButton",
    "publishForm",
    "documentsList",
    "organizationForm",
    "organizationsCsvForm",
    "organizationsCsvFile",
    "importOrganizationsButton",
    "alertForm",
    "alertCsvForm",
    "adminOrganizationsTable",
    "adminAlertsTable",
    "adminDocumentsTable",
  ];

  const missingElements =
    requiredElementIds.filter(
      (id) =>
        !elementExists(id)
    );

  if (
    missingElements.length > 0
  ) {
    throw new Error(
      `Éléments HTML introuvables : ${missingElements.join(", ")}.`
    );
  }
}

/* ==========================================================
   119. PRÉPARATION INITIALE DE L’INTERFACE
   ========================================================== */

function initializeInterface() {
  resetPublishForm();
  resetOrganizationForm();
  resetOrganizationsCsvImport();
  resetAlertForm();
  resetAlertCsvImport();
  resetDocumentFilters();

  updateAuthenticationInterface();
  updatePublishSummary();

  showAdminTab(
    "organizations"
  );

  const activeView =
    document.querySelector(
      ".view.active-view"
    );

  if (!activeView) {
    showView(
      "home"
    );
  }
}

/* ==========================================================
   120. CHARGEMENT INITIAL DES DONNÉES
   ========================================================== */

async function loadInitialData() {
  const loadingErrors = [];

  const referenceErrors =
    await loadPublicReferenceData();

  loadingErrors.push(
    ...referenceErrors
  );

  try {
    await loadDocuments();
  } catch (error) {
    console.error(
      "Erreur de chargement des documents :",
      error
    );

    loadingErrors.push(
      error
    );
  }

  if (state.isAdmin) {
    try {
      await loadAdminData();

      refreshDocumentEnrichment();
    } catch (error) {
      console.error(
        "Erreur de chargement de l’administration :",
        error
      );

      loadingErrors.push(
        error
      );
    }
  }

  if (
    loadingErrors.length > 0
  ) {
    showInitializationError(
      new Error(
        loadingErrors
          .map(
            (error) =>
              getErrorMessage(
                error,
                "Erreur de chargement."
              )
          )
          .join(" ")
      )
    );
  }
}

/* ==========================================================
   121. DÉMARRAGE DE L’APPLICATION
   ========================================================== */

async function initializeApplication() {
  if (state.initialized) {
    return;
  }

  state.initialized =
    true;

  setInitialLoadingState(
    true
  );

  clearInitializationError();

  try {
    validateConfiguration();

    validateRequiredInterfaceElements();

    initializeEvents();

    await initializeAuthentication();

    initializeInterface();

    await loadInitialData();
  } catch (error) {
    state.initialized =
      false;

    showInitializationError(
      error
    );
  } finally {
    setInitialLoadingState(
      false
    );
  }
}

/* ==========================================================
   122. LANCEMENT APRÈS CHARGEMENT DU DOM
   ========================================================== */

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    initializeApplication,
    {
      once: true,
    }
  );
} else {
  initializeApplication();
}
