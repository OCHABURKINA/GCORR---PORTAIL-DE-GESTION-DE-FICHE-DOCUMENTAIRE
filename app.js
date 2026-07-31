import {
  createClient,
} from "https://esm.sh/@supabase/supabase-js@2";

import {
  CONFIG,
} from "./config.js";

/* ==========================================================
   1. INITIALISATION SUPABASE
   ========================================================== */

const supabase = createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession:
        CONFIG.AUTH?.PERSIST_SESSION ?? true,

      autoRefreshToken:
        CONFIG.AUTH?.AUTO_REFRESH_TOKEN ?? true,

      detectSessionInUrl:
        CONFIG.AUTH?.DETECT_SESSION_IN_URL ?? true,
    },
  }
);

/* ==========================================================
   2. ETAT GLOBAL
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

/* ==========================================================
   4. SECURISATION DU HTML
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

function slugify(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
    .replace(/\s+/g, "_");
}

/* ==========================================================
   6. FICHIERS
   ========================================================== */

function sanitizeFileName(fileName) {
  const name =
    String(fileName || "document.pdf");

  const lastDotIndex =
    name.lastIndexOf(".");

  const extension =
    lastDotIndex >= 0
      ? name
          .slice(lastDotIndex)
          .toLowerCase()
      : ".pdf";

  const baseName =
    lastDotIndex >= 0
      ? name.slice(
          0,
          lastDotIndex
        )
      : name;

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
    unitIndex < units.length - 1
  ) {
    value /= 1024;
    unitIndex += 1;
  }

  const decimals =
    unitIndex === 0
      ? 0
      : 1;

  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
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

  if (
    file.size >
    CONFIG.MAX_FILE_SIZE
  ) {
    throw new Error(
      CONFIG.MESSAGES?.FILE_TOO_LARGE ||
      "La taille maximale autorisée est de 20 Mo."
    );
  }
}

/* ==========================================================
   7. DATES
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
    CONFIG.LOCALE || "fr-FR",
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
   8. MESSAGES
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
    message;

  element.className =
    `message message-${type}`;
}

function hideMessage(element) {
  if (!element) {
    return;
  }

  element.textContent = "";
  element.className =
    "message hidden";
}

/* ==========================================================
   9. BOUTONS DE CHARGEMENT
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
      !button.dataset.originalText
    ) {
      button.dataset.originalText =
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
    button.dataset.originalText ||
    button.textContent;

  button.removeAttribute(
    "aria-busy"
  );
}

/* ==========================================================
   10. VALEURS UNIQUES
   ========================================================== */

function uniqueValues(values) {
  const normalizedValues =
    values
      .map((value) =>
        String(value ?? "").trim()
      )
      .filter(Boolean);

  return [
    ...new Set(
      normalizedValues
    ),
  ].sort((a, b) =>
    a.localeCompare(
      b,
      "fr",
      {
        sensitivity: "base",
      }
    )
  );
}

/* ==========================================================
   11. URL PUBLIQUE STORAGE
   ========================================================== */

function getPublicUrl(storagePath) {
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

  return (
    data?.publicUrl ||
    ""
  );
}

/* ==========================================================
   12. RECHERCHE DANS L'ETAT GLOBAL
   ========================================================== */

function getOrganizationById(
  organizationId
) {
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
  return (
    state.alertCommuneOptions.find(
      (item) =>
        item.alert_commune_id ===
        alertCommuneId
    ) ||
    state.adminAlertCommunes.find(
      (item) =>
        item.id ===
        alertCommuneId
    ) ||
    null
  );
}

function getAlertCommunes(
  alertId,
  activeOnly = true
) {
  return state.alertCommuneOptions.filter(
    (item) => {
      if (
        item.alert_id !== alertId
      ) {
        return false;
      }

      if (!activeOnly) {
        return true;
      }

      return (
        item.alert_is_active !== false &&
        item.alert_commune_is_active !== false
      );
    }
  );
}

/* ==========================================================
   13. NAVIGATION PRINCIPALE
   ========================================================== */

function showView(viewName) {
  if (
    viewName === "admin" &&
    !state.isAdmin
  ) {
    openLoginModal();
    return;
  }

  getElements(".view")
    .forEach((view) => {
      view.classList.remove(
        "active-view"
      );
    });

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

  targetView.classList.add(
    "active-view"
  );

  getElements(".nav-button")
    .forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.view ===
          viewName
      );
    });

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
      .catch((error) => {
        console.error(
          "Erreur de chargement de l’administration :",
          error
        );
      });
  }
}

function initializeNavigation() {
  getElements("[data-view]")
    .forEach((element) => {
      element.addEventListener(
        "click",
        () => {
          const targetView =
            element.dataset.view;

          if (targetView) {
            showView(
              targetView
            );
          }
        }
      );
    });
}

/* ==========================================================
   14. ONGLETS ADMINISTRATIFS
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

  if (
    tabName === "organizations"
  ) {
    renderAdminOrganizations();
  }

  if (
    tabName === "alerts"
  ) {
    renderAdminAlerts();
  }

  if (
    tabName === "documents"
  ) {
    renderAdminDocuments();
  }
}

function initializeAdminTabs() {
  const buttons =
    getElements(
      "[data-admin-tab]"
    );

  buttons.forEach(
    (button) => {
      button.addEventListener(
        "click",
        () => {
          const tabName =
            button.dataset.adminTab;

          if (tabName) {
            showAdminTab(
              tabName
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
   15. AUTHENTIFICATION ADMINISTRATEUR
   ========================================================== */

async function initializeAuthentication() {
  const {
    data,
    error,
  } = await supabase.auth.getSession();

  if (error) {
    console.error(
      "Erreur lors de la récupération de la session :",
      error
    );
  }

  state.session =
    data?.session || null;

  await checkAdminStatus();

  supabase.auth.onAuthStateChange(
    async (_event, session) => {
      state.session =
        session || null;

      await checkAdminStatus();

      try {
        await loadDocuments();

        if (state.isAdmin) {
          await loadAdminData();
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
   16. VERIFICATION DU ROLE ADMINISTRATEUR
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
    data || null;

  state.isAdmin =
    data?.role === "admin";

  updateAuthenticationInterface();
}

/* ==========================================================
   17. INTERFACE D'AUTHENTIFICATION
   ========================================================== */

function updateAuthenticationInterface() {
  const loginButton =
    getElement("loginButton");

  const logoutButton =
    getElement("logoutButton");

  getElements(".admin-only")
    .forEach((element) => {
      element.classList.toggle(
        "hidden",
        !state.isAdmin
      );
    });

  loginButton?.classList.toggle(
    "hidden",
    state.isAdmin
  );

  logoutButton?.classList.toggle(
    "hidden",
    !state.isAdmin
  );

  const adminIdentity =
    getElement("adminIdentity");

  if (!adminIdentity) {
    return;
  }

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

    return;
  }

  adminIdentity.textContent =
    "Gestion des organisations, des Alertes ID, des communes associées et des fiches publiées.";
}

/* ==========================================================
   18. MODALE DE CONNEXION
   ========================================================== */

function openLoginModal() {
  const modal =
    getElement("loginModal");

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

  window.setTimeout(
    () => {
      getElement("adminEmail")
        ?.focus();
    },
    100
  );
}

function closeLoginModal() {
  const modal =
    getElement("loginModal");

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
    getElement("loginMessage")
  );
}

/* ==========================================================
   19. CONNEXION ADMINISTRATEUR
   ========================================================== */

async function handleAdminLogin(event) {
  event.preventDefault();

  const submitButton =
    event.submitter ||
    event.currentTarget
      ?.querySelector(
        'button[type="submit"]'
      );

  const messageElement =
    getElement("loginMessage");

  hideMessage(
    messageElement
  );

  const email =
    getElement("adminEmail")
      ?.value
      .trim() || "";

  const password =
    getElement("adminPassword")
      ?.value || "";

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
      data?.session || null;

    await checkAdminStatus();

    if (!state.isAdmin) {
      await supabase.auth.signOut();

      state.session = null;

      throw new Error(
        "Ce compte ne possède pas le rôle administrateur."
      );
    }

    getElement("loginForm")
      ?.reset();

    closeLoginModal();

    await loadAdminData();

    showView("admin");
  } catch (error) {
    showMessage(
      messageElement,
      error?.message ||
        "Connexion impossible.",
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
   20. DECONNEXION
   ========================================================== */

async function handleLogout() {
  const {
    error,
  } =
    await supabase.auth.signOut();

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

  showView("home");
}

/* ==========================================================
   21. CHARGEMENT DES ORGANISATIONS PUBLIQUES
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
   22. CHARGEMENT DES ALERTES PUBLIQUES
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
        ascending: true,
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
   23. CHARGEMENT DES COMMUNES PUBLIQUES
   ========================================================== */

/**
 * Cette fonction ne dépend plus des colonnes :
 *
 * - alert_is_active
 * - alert_commune_is_active
 *
 * Elle utilise uniquement les colonnes réellement nécessaires
 * dans la vue alert_commune_options.
 */
async function loadPublicAlertCommuneOptions() {
  const {
    data,
    error,
  } = await supabase
    .from("alert_commune_options")
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
        ascending: true,
      }
    )
    .order(
      "commune",
      {
        ascending: true,
      }
    );

  if (error) {
    throw new Error(
      `Impossible de charger les communes des alertes : ${error.message}`
    );
  }

  state.alertCommuneOptions =
    (data || []).map(
      (item) => ({
        ...item,

        /*
         * Ces propriétés sont ajoutées localement
         * pour conserver la compatibilité avec le reste
         * de l'application.
         */
        alert_is_active:
          true,

        alert_commune_is_active:
          true,
      })
    );

  const currentAlertId =
    getElement("publishAlert")
      ?.value || "";

  populatePublishCommuneSelect(
    currentAlertId
  );

  populateDocumentFilters();
}

/* ==========================================================
   24. CHARGEMENT DES REFERENTIELS PUBLICS
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
        result.status === "rejected"
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
   25. LISTES DEROULANTES DES ORGANISATIONS
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
      }
    }
  );
}

/* ==========================================================
   26. LISTE DEROULANTE DES ALERTES POUR PUBLICATION
   ========================================================== */

function populatePublishAlertSelect() {
  const select =
    getElement("publishAlert");

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
    "Sélectionner une Alerte ID";

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
  }
}

/* ==========================================================
   27. FILTRE DES ALERTES
   ========================================================== */

function populateAlertFilters() {
  const select =
    getElement("filterAlert");

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
  }
}

/* ==========================================================
   28. LISTE DES COMMUNES SELON L'ALERTE
   ========================================================== */

function populatePublishCommuneSelect(
  alertId
) {
  const select =
    getElement("publishCommune");

  if (!select) {
    return;
  }

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
    matchingCommunes.length === 0
  ) {
    const option =
      document.createElement(
        "option"
      );

    option.value = "";
    option.textContent =
      "Aucune commune disponible";

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
    .sort(
      (a, b) =>
        a.commune.localeCompare(
          b.commune,
          "fr",
          {
            sensitivity: "base",
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
}
/* ==========================================================
   29. GESTION DE LA SELECTION DE L'ORGANISATION
   ========================================================== */

function handlePublishOrganizationChange() {
  updatePublishSummary();
}

/* ==========================================================
   30. GESTION DE LA SELECTION DE L'ALERTE
   ========================================================== */

function handlePublishAlertChange() {
  const alertId =
    getElement("publishAlert")
      ?.value || "";

  state.selectedPublishAlert =
    getAlertById(alertId);

  state.selectedPublishCommune =
    null;

  const regionInput =
    getElement("publishRegion");

  if (regionInput) {
    regionInput.value =
      state.selectedPublishAlert
        ?.region || "";
  }

  populatePublishCommuneSelect(
    alertId
  );

  const communeSelect =
    getElement("publishCommune");

  if (communeSelect) {
    communeSelect.value = "";
  }

  updatePublishSummary();
}

/* ==========================================================
   31. GESTION DE LA SELECTION DE LA COMMUNE
   ========================================================== */

function handlePublishCommuneChange() {
  const communeId =
    getElement("publishCommune")
      ?.value || "";

  const selectedCommune =
    getAlertCommuneById(
      communeId
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
      getElement("publishCommune");

    if (communeSelect) {
      communeSelect.value = "";
    }

    window.alert(
      "La commune sélectionnée ne correspond pas à l’Alerte ID choisie."
    );

    updatePublishSummary();
    return;
  }

  state.selectedPublishCommune =
    selectedCommune;

  updatePublishSummary();
}

/* ==========================================================
   32. GESTION DU FICHIER PDF
   ========================================================== */

function handlePublishFileChange() {
  const fileInput =
    getElement("publishFile");

  const selectedFileInfo =
    getElement(
      "selectedFileInfo"
    );

  const file =
    fileInput
      ?.files?.[0];

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
    validatePdf(file);

    selectedFileInfo.innerHTML = `
      <div>
        <strong>
          ${escapeHtml(file.name)}
        </strong>

        <span>
          ${formatFileSize(file.size)}
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

    window.alert(
      error?.message ||
      "Le fichier sélectionné est invalide."
    );
  }

  updatePublishSummary();
}

/* ==========================================================
   33. MISE A JOUR DU RECAPITULATIF
   ========================================================== */

function updatePublishSummary() {
  const organizationId =
    getElement(
      "publishOrganization"
    )?.value || "";

  const organization =
    getOrganizationById(
      organizationId
    );

  const file =
    getElement("publishFile")
      ?.files?.[0];

  const summaryOrganization =
    getElement(
      "summaryOrganization"
    );

  const summaryAlert =
    getElement(
      "summaryAlert"
    );

  const summaryRegion =
    getElement(
      "summaryRegion"
    );

  const summaryCommune =
    getElement(
      "summaryCommune"
    );

  const summaryFile =
    getElement(
      "summaryFile"
    );

  if (summaryOrganization) {
    summaryOrganization.textContent =
      organization?.name ||
      "—";
  }

  if (summaryAlert) {
    summaryAlert.textContent =
      state.selectedPublishAlert
        ?.alert_code ||
      "—";
  }

  if (summaryRegion) {
    summaryRegion.textContent =
      state.selectedPublishAlert
        ?.region ||
      "—";
  }

  if (summaryCommune) {
    summaryCommune.textContent =
      state.selectedPublishCommune
        ?.commune ||
      "—";
  }

  if (summaryFile) {
    summaryFile.textContent =
      file?.name ||
      "—";
  }
}

/* ==========================================================
   34. BARRE DE PROGRESSION
   ========================================================== */

function updatePublishProgress(value) {
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
    String(normalizedValue)
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
    bar.style.width = "0%";
  }

  if (text) {
    text.textContent = "0 %";
  }

  progressTrack?.setAttribute(
    "aria-valuenow",
    "0"
  );
}

/* ==========================================================
   35. CREATION DU CHEMIN STORAGE
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

  const uniqueId =
    typeof crypto?.randomUUID ===
    "function"
      ? crypto.randomUUID()
      : Math.random()
          .toString(36)
          .slice(2);

  const uniqueFileName =
    [
      Date.now(),
      uniqueId,
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
   36. VALIDATION DE LA PUBLICATION
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

  if (!alertOption) {
    throw new Error(
      "Veuillez sélectionner une Alerte ID valide."
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

  validatePdf(file);
}

/* ==========================================================
   37. PUBLICATION DU DOCUMENT
   ========================================================== */

async function handlePublicPublication(
  event
) {
  event.preventDefault();

  const submitButton =
    event.submitter ||
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

  let uploadedStoragePath =
    "";

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

    setButtonLoading(
      submitButton,
      true,
      "Publication..."
    );

    updatePublishProgress(10);

    const storagePath =
      buildDocumentStoragePath({
        organization,
        alertOption,
        communeOption,
        file,
      });

    uploadedStoragePath =
      storagePath;

    /* ------------------------------------------------------
       Étape 1 : chargement du PDF dans Supabase Storage
       ------------------------------------------------------ */

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

    updatePublishProgress(65);

    /* ------------------------------------------------------
       Étape 2 : création de la ligne dans documents
       ------------------------------------------------------ */

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
      .from("documents")
      .insert(
        documentRecord
      );

    if (insertError) {
      const {
        error: cleanupError,
      } = await supabase.storage
        .from(
          CONFIG.STORAGE_BUCKET
        )
        .remove([
          storagePath,
        ]);

      if (cleanupError) {
        console.warn(
          "Le fichier chargé n’a pas pu être supprimé après l’échec de l’enregistrement :",
          cleanupError
        );
      } else {
        uploadedStoragePath = "";
      }

      throw new Error(
        `Enregistrement du document impossible : ${insertError.message}`
      );
    }

    uploadedStoragePath = "";

    updatePublishProgress(100);

    /*
     * Le formulaire est réinitialisé avant l’affichage
     * du message afin de conserver la confirmation visible.
     */
    resetPublishForm({
      preserveMessage: true,
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

    if (uploadedStoragePath) {
      console.warn(
        "Un fichier peut être resté dans Supabase Storage :",
        uploadedStoragePath
      );
    }

    showMessage(
      messageElement,
      error?.message ||
      "Impossible de publier la fiche.",
      "error"
    );
  } finally {
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
   38. REINITIALISATION DU FORMULAIRE DE PUBLICATION
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

  if (alertSelect) {
    alertSelect.value = "";

    alertSelect.disabled =
      state.alerts.length === 0;
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
    communeSelect.disabled = true;
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
   39. CHARGEMENT DES DOCUMENTS
   ========================================================== */

async function loadDocuments() {
  let query = supabase
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

  /*
   * Un utilisateur public ne voit que les documents publiés.
   * L’administrateur peut voir tous les statuts.
   */
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
   40. ENRICHISSEMENT DES DOCUMENTS
   ========================================================== */

/**
 * Ajoute à chaque document :
 *
 * - la région ;
 * - la commune ;
 * - le statut de l’alerte ;
 * - le statut de la commune.
 *
 * Ces informations sont obtenues depuis :
 *
 * - state.alerts ;
 * - state.alertCommuneOptions ;
 * - state.adminAlerts ;
 * - state.adminAlertCommunes.
 */
function enrichDocuments(documents) {
  const publicCommuneMap =
    new Map(
      state.alertCommuneOptions.map(
        (item) => [
          item.alert_commune_id,
          item,
        ]
      )
    );

  const adminCommuneMap =
    new Map(
      state.adminAlertCommunes.map(
        (item) => [
          item.id,
          item,
        ]
      )
    );

  const publicAlertMap =
    new Map(
      state.alerts.map(
        (item) => [
          item.id,
          item,
        ]
      )
    );

  const adminAlertMap =
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
      const communeOption =
        publicCommuneMap.get(
          documentItem.alert_commune_id
        ) ||
        adminCommuneMap.get(
          documentItem.alert_commune_id
        ) ||
        null;

      const alertOption =
        publicAlertMap.get(
          documentItem.alert_id
        ) ||
        adminAlertMap.get(
          documentItem.alert_id
        ) ||
        null;

      return {
        ...documentItem,

        region:
          communeOption?.region ||
          alertOption?.region ||
          "",

        commune:
          communeOption?.commune ||
          "",

        alert_is_active:
          communeOption
            ?.alert_is_active ??
          alertOption
            ?.is_active ??
          null,

        alert_commune_is_active:
          communeOption
            ?.alert_commune_is_active ??
          communeOption
            ?.is_active ??
          null,
      };
    }
  );
}

/* ==========================================================
   41. RAFRAICHISSEMENT DE L'ENRICHISSEMENT
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
   42. FILTRAGE DES DOCUMENTS
   ========================================================== */

function getFilteredDocuments() {
  const searchValue =
    getElement("documentSearch")
      ?.value
      .trim()
      .toLowerCase() || "";

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
        documentItem.publication_status !==
          "published"
      ) {
        return false;
      }

      const searchableText = [
        documentItem.file_name,
        documentItem.organization_name,
        documentItem.alert_code,
        documentItem.region,
        documentItem.commune,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !searchValue ||
        searchableText.includes(
          searchValue
        );

      const matchesOrganization =
        !organizationId ||
        documentItem.organization_id ===
          organizationId;

      const matchesAlert =
        !alertCode ||
        documentItem.alert_code ===
          alertCode;

      const matchesCommune =
        !commune ||
        documentItem.commune ===
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
   43. AFFICHAGE DES DOCUMENTS PUBLICS
   ========================================================== */

function renderDocuments() {
  const container =
    getElement("documentsList");

  if (!container) {
    return;
  }

  const visibleDocuments =
    getFilteredDocuments().filter(
      (item) =>
        item.publication_status ===
        "published"
    );

  updateDocumentsResultTitle(
    visibleDocuments.length
  );

  if (
    visibleDocuments.length === 0
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
   44. TITRE DES RESULTATS
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

  title.textContent =
    `${documentCount} fiche${
      documentCount > 1
        ? "s"
        : ""
    } publiée${
      documentCount > 1
        ? "s"
        : ""
    }`;
}

/* ==========================================================
   45. CARTE D'UN DOCUMENT
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
          class="button button-primary button-full"
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
          class="button button-secondary button-full"
          disabled
        >
          Fichier indisponible
        </button>
      `;

  return `
    <article class="document-card">
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

      <dl class="document-metadata">
        <div>
          <dt>
            Organisation
          </dt>

          <dd>
            ${escapeHtml(
              organizationName
            )}
          </dd>
        </div>

        <div>
          <dt>
            Alerte ID
          </dt>

          <dd>
            ${escapeHtml(
              alertCode
            )}
          </dd>
        </div>

        <div>
          <dt>
            Région
          </dt>

          <dd>
            ${escapeHtml(
              region
            )}
          </dd>
        </div>

        <div>
          <dt>
            Commune
          </dt>

          <dd>
            ${escapeHtml(
              commune
            )}
          </dd>
        </div>
      </dl>

      <div class="document-card-footer">
        <span>
          ${formatFileSize(
            documentItem.file_size
          )}
        </span>

        <span>
          ${formatDate(
            documentItem.created_at
          )}
        </span>
      </div>

      ${downloadControl}
    </article>
  `;
}

/* ==========================================================
   46. STATISTIQUES PUBLIQUES
   ========================================================== */

function renderStatistics() {
  const publishedDocuments =
    state.documents.filter(
      (item) =>
        item.publication_status ===
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
            item.alert_commune_id ||
            item.commune
        )
        .filter(Boolean)
    );

  const documentsCount =
    getElement(
      "documentsCount"
    );

  const organizationsCount =
    getElement(
      "organizationsCount"
    );

  const alertsCount =
    getElement(
      "alertsCount"
    );

  const communesCount =
    getElement(
      "communesCount"
    );

  if (documentsCount) {
    documentsCount.textContent =
      String(
        publishedDocuments.length
      );
  }

  if (organizationsCount) {
    organizationsCount.textContent =
      String(
        organizationIds.size
      );
  }

  if (alertsCount) {
    alertsCount.textContent =
      String(
        alertIds.size
      );
  }

  if (communesCount) {
    communesCount.textContent =
      String(
        communeIds.size
      );
  }
}

/* ==========================================================
   47. FILTRE DES COMMUNES
   ========================================================== */

function populateDocumentFilters() {
  const communes =
    state.documents.map(
      (item) =>
        item.commune
    );

  populateUniqueSelect(
    "filterCommune",
    communes,
    "Toutes les communes"
  );
}

/* ==========================================================
   48. REMPLISSAGE D'UNE LISTE UNIQUE
   ========================================================== */

function populateUniqueSelect(
  selectId,
  values,
  defaultLabel
) {
  const select =
    getElement(selectId);

  if (!select) {
    return;
  }

  const currentValue =
    select.value;

  const valuesList =
    uniqueValues(values);

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
  }
}

/* ==========================================================
   49. REINITIALISATION DES FILTRES
   ========================================================== */

function resetDocumentFilters() {
  const filterIds = [
    "documentSearch",
    "filterOrganization",
    "filterAlert",
    "filterCommune",
  ];

  filterIds.forEach(
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
   50. ACTUALISATION MANUELLE DES DOCUMENTS
   ========================================================== */

async function refreshDocuments() {
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
      error?.message ||
      "Impossible d’actualiser les documents."
    );
  } finally {
    setButtonLoading(
      button,
      false
    );
  }
}
/* ==========================================================
   51. CHARGEMENT GLOBAL DE L'ADMINISTRATION
   ========================================================== */

async function loadAdminData() {
  if (!state.isAdmin) {
    return;
  }

  hideMessage(
    getElement(
      "adminGlobalMessage"
    )
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
          result.status === "rejected"
      )
      .map(
        (result) =>
          result.reason
      );

  if (errors.length > 0) {
    errors.forEach(
      (error) => {
        console.error(
          "Erreur de chargement administratif :",
          error
        );
      }
    );

    showMessage(
      getElement(
        "adminGlobalMessage"
      ),
      errors
        .map(
          (error) =>
            error?.message ||
            String(error)
        )
        .join(" "),
      "error"
    );
  }

  renderAdminDocuments();
}

/* ==========================================================
   52. CHARGEMENT DES ORGANISATIONS ADMINISTRATIVES
   ========================================================== */

async function loadAdminOrganizations() {
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
   53. AFFICHAGE DES ORGANISATIONS
   ========================================================== */

function renderAdminOrganizations() {
  const tableBody =
    getElement(
      "adminOrganizationsTable"
    );

  if (!tableBody) {
    return;
  }

  if (
    state.adminOrganizations.length === 0
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
   54. REINITIALISATION DU FORMULAIRE ORGANISATION
   ========================================================== */

function resetOrganizationForm() {
  const form =
    getElement(
      "organizationForm"
    );

  form?.reset();

  const databaseId =
    getElement(
      "organizationDatabaseId"
    );

  if (databaseId) {
    databaseId.value = "";
  }

  const activeCheckbox =
    getElement(
      "organizationActive"
    );

  if (activeCheckbox) {
    activeCheckbox.checked =
      true;
  }

  const submitButton =
    getElement(
      "organizationSubmitButton"
    );

  if (submitButton) {
    submitButton.textContent =
      "Enregistrer l’organisation";
  }

  hideMessage(
    getElement(
      "organizationMessage"
    )
  );
}

/* ==========================================================
   55. EDITION D'UNE ORGANISATION
   ========================================================== */

function editOrganization(
  organizationId
) {
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

  if (databaseId) {
    databaseId.value =
      organization.id;
  }

  if (nameInput) {
    nameInput.value =
      organization.name || "";
  }

  if (acronymInput) {
    acronymInput.value =
      organization.acronym || "";
  }

  if (activeCheckbox) {
    activeCheckbox.checked =
      Boolean(
        organization.is_active
      );
  }

  const submitButton =
    getElement(
      "organizationSubmitButton"
    );

  if (submitButton) {
    submitButton.textContent =
      "Mettre à jour l’organisation";
  }

  nameInput?.focus();
}

/* ==========================================================
   56. ENREGISTREMENT D'UNE ORGANISATION
   ========================================================== */

async function handleOrganizationSubmit(
  event
) {
  event.preventDefault();

  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const submitButton =
    event.submitter ||
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
    )?.checked ?? true;

  if (!name) {
    showMessage(
      messageElement,
      "Le nom de l’organisation est obligatoire.",
      "error"
    );

    return;
  }

  const payload = {
    name,
    acronym:
      acronym || null,

    slug:
      slugify(
        acronym || name
      ),

    is_active:
      isActive,

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
        .from("organizations")
        .update(payload)
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
        .from("organizations")
        .insert({
          ...payload,

          created_at:
            new Date().toISOString(),
        });

      if (error) {
        throw error;
      }
    }

    resetOrganizationForm();

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
  } catch (error) {
    console.error(
      "Erreur d’enregistrement de l’organisation :",
      error
    );

    showMessage(
      messageElement,
      error?.message ||
      "Impossible d’enregistrer l’organisation.",
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
   57. ACTIVATION OU DESACTIVATION D'UNE ORGANISATION
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
    return;
  }

  const newStatus =
    !organization.is_active;

  const confirmation =
    window.confirm(
      newStatus
        ? `Activer l’organisation « ${organization.name} » ?`
        : `Désactiver l’organisation « ${organization.name} » ?`
    );

  if (!confirmation) {
    return;
  }

  const {
    error,
  } = await supabase
    .from("organizations")
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
}

/* ==========================================================
   58. CHARGEMENT ADMINISTRATIF DES ALERTES
   ========================================================== */

async function loadAdminAlerts() {
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
        ascending: true,
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
   59. AFFICHAGE DES ALERTES
   ========================================================== */

function renderAdminAlerts() {
  const tableBody =
    getElement(
      "adminAlertsTable"
    );

  if (!tableBody) {
    return;
  }

  if (
    state.adminAlerts.length === 0
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
            alertItem.communes.filter(
              (communeItem) =>
                communeItem.is_active !==
                false
            );

          const communesText =
            activeCommunes.length > 0
              ? activeCommunes
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
                  )
                  .join(", ")
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
                ${escapeHtml(
                  communesText
                )}
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
   60. ANALYSE DE LA LISTE DES COMMUNES
   ========================================================== */

function parseCommuneList(value) {
  const communes =
    String(value || "")
      .split(/[,\n;]+/)
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
          sensitivity: "base",
        }
      )
  );
}

/* ==========================================================
   61. REINITIALISATION DU FORMULAIRE ALERTE
   ========================================================== */

function resetAlertForm() {
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

  if (alertDatabaseId) {
    alertDatabaseId.value = "";
  }

  if (communeDatabaseId) {
    communeDatabaseId.value = "";
  }

  const activeCheckbox =
    getElement(
      "alertActive"
    );

  if (activeCheckbox) {
    activeCheckbox.checked =
      true;
  }

  const submitButton =
    getElement(
      "alertSubmitButton"
    );

  if (submitButton) {
    submitButton.textContent =
      "Enregistrer l’alerte";
  }

  hideMessage(
    getElement(
      "alertMessage"
    )
  );
}

/* ==========================================================
   62. EDITION D'UNE ALERTE
   ========================================================== */

function editAlert(alertId) {
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

  if (databaseId) {
    databaseId.value =
      alertItem.id;
  }

  if (codeInput) {
    codeInput.value =
      alertItem.alert_code || "";
  }

  if (regionInput) {
    regionInput.value =
      alertItem.region || "";
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

  const submitButton =
    getElement(
      "alertSubmitButton"
    );

  if (submitButton) {
    submitButton.textContent =
      "Mettre à jour l’alerte";
  }

  codeInput?.focus();
}

/* ==========================================================
   63. ENREGISTREMENT D'UNE ALERTE
   ========================================================== */

async function handleAlertSubmit(
  event
) {
  event.preventDefault();

  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const submitButton =
    event.submitter ||
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
    )?.checked ?? true;

  if (!alertCode) {
    showMessage(
      messageElement,
      "L’Alerte ID est obligatoire.",
      "error"
    );

    return;
  }

  if (!region) {
    showMessage(
      messageElement,
      "La région est obligatoire.",
      "error"
    );

    return;
  }

  if (communes.length === 0) {
    showMessage(
      messageElement,
      "Veuillez renseigner au moins une commune.",
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
        isActive,

      updated_at:
        new Date().toISOString(),
    };

    if (alertId) {
      const {
        error,
      } = await supabase
        .from("alerts")
        .update(payload)
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

    resetAlertForm();

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
  } catch (error) {
    console.error(
      "Erreur d’enregistrement de l’alerte :",
      error
    );

    showMessage(
      messageElement,
      error?.message ||
      "Impossible d’enregistrer l’alerte.",
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
   64. SYNCHRONISATION DES COMMUNES
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

  (existingCommunes || [])
    .forEach(
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
        existing.is_active === false ||
        existing.commune !== commune
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

  if (rowsToInsert.length > 0) {
    const {
      error,
    } = await supabase
      .from("alert_communes")
      .insert(
        rowsToInsert
      );

    if (error) {
      throw new Error(
        `Impossible d’ajouter les communes : ${error.message}`
      );
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

  if (rowsToDeactivate.length > 0) {
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
        rowsToDeactivate
      );

    if (error) {
      throw new Error(
        `Impossible de désactiver les communes retirées : ${error.message}`
      );
    }
  }
}

/* ==========================================================
   65. ACTIVATION OU DESACTIVATION D'UNE ALERTE
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
    return;
  }

  const newStatus =
    !alertItem.is_active;

  const confirmation =
    window.confirm(
      newStatus
        ? `Activer l’Alerte ID « ${alertItem.alert_code} » ?`
        : `Désactiver l’Alerte ID « ${alertItem.alert_code} » ?`
    );

  if (!confirmation) {
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
      break;
  }
}

/* ==========================================================
   67. ACTIONS DU TABLEAU DES ALERTES
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
      break;
  }
}
/* ==========================================================
   68. DETECTION DU SEPARATEUR CSV
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
   69. ANALYSE D'UNE LIGNE CSV
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
   70. TRANSFORMATION DU CSV EN OBJETS
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
   71. RECUPERATION D'UNE VALEUR CSV
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
      const value =
        String(
          row[
            normalizedAlias
          ] ?? ""
        ).trim();

      if (value) {
        return value;
      }
    }
  }

  return "";
}

/* ==========================================================
   72. VALIDATION DES COLONNES CSV
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
      "Alerte ID"
    );
  }

  if (!hasRegion) {
    missingColumns.push(
      "Région"
    );
  }

  if (!hasCommune) {
    missingColumns.push(
      "Communes"
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
   73. NORMALISATION D'UNE LIGNE D'ALERTE
   ========================================================== */

function normalizeAlertCsvRow(
  row
) {
  const alertCode =
    getCsvValue(
      row,
      [
        "Alerte ID",
        "Alert ID",
        "Alerte",
        "alert_code",
        "alert_id",
      ]
    );

  const region =
    getCsvValue(
      row,
      [
        "Région",
        "Region",
        "region",
      ]
    );

  const communeValue =
    getCsvValue(
      row,
      [
        "Communes",
        "Commune",
        "communes",
        "commune",
      ]
    );

  return {
    alertCode,
    region,

    communes:
      parseCommuneList(
        communeValue
      ),

    lineNumber:
      row.__lineNumber,
  };
}

/* ==========================================================
   74. REGROUPEMENT DES LIGNES PAR ALERTE
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
          `Ligne ${row.lineNumber} : région manquante pour l’Alerte ID ${row.alertCode}.`
        );

        return;
      }

      if (
        row.communes.length === 0
      ) {
        validationErrors.push(
          `Ligne ${row.lineNumber} : commune manquante pour l’Alerte ID ${row.alertCode}.`
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

      groupedAlert
        .sourceLines
        .push(
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
          `Ligne ${row.lineNumber} : l’Alerte ID ${row.alertCode} est rattachée à plusieurs régions (${groupedAlert.region} et ${row.region}).`
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
    const displayedErrors =
      validationErrors
        .slice(0, 15)
        .join("\n");

    const remainingCount =
      validationErrors.length - 15;

    throw new Error(
      remainingCount > 0
        ? `${displayedErrors}\n${remainingCount} autre(s) erreur(s) non affichée(s).`
        : displayedErrors
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
   75. LECTURE DU FICHIER CSV
   ========================================================== */

async function readAlertCsvFile(
  file
) {
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
    "application/vnd.ms-excel",
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

  return file.text();
}

/* ==========================================================
   76. PREVISUALISATION DU CSV
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
    groupedAlerts.length === 0
  ) {
    preview.innerHTML = `
      <div class="empty-state">
        <h3>
          Aucune Alerte ID valide
        </h3>

        <p>
          Vérifiez le contenu du fichier sélectionné.
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
            <th>
              Alerte ID
            </th>

            <th>
              Région
            </th>

            <th>
              Communes
            </th>
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
   77. PREVISUALISATION DU FICHIER CSV
   ========================================================== */

async function handleAlertCsvPreview() {
  const file =
    getElement(
      "alertCsvFile"
    )?.files?.[0];

  const messageElement =
    getElement(
      "alertCsvMessage"
    );

  hideMessage(
    messageElement
  );

  try {
    const csvText =
      await readAlertCsvFile(
        file
      );

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
      "Le fichier CSV est valide et prêt à être importé.",
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
      error?.message ||
      "Le fichier CSV est invalide.",
      "error"
    );
  }
}

/* ==========================================================
   78. IMPORT DU FICHIER CSV
   ========================================================== */

async function handleAlertCsvImport(
  event
) {
  event.preventDefault();

  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const submitButton =
    event.submitter ||
    getElement(
      "alertCsvImportButton"
    );

  const messageElement =
    getElement(
      "alertCsvMessage"
    );

  const fileInput =
    getElement(
      "alertCsvFile"
    );

  const file =
    fileInput
      ?.files?.[0];

  hideMessage(
    messageElement
  );

  setButtonLoading(
    submitButton,
    true,
    "Importation..."
  );

  try {
    const csvText =
      await readAlertCsvFile(
        file
      );

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
      groupedAlerts.length === 0
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

    if (fileInput) {
      fileInput.value = "";
    }

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
        `${result.createdAlerts} nouvelle(s) alerte(s).`,
        `${result.updatedAlerts} alerte(s) mise(s) à jour.`,
        `${result.createdCommunes} commune(s) créée(s).`,
        `${result.reactivatedCommunes} commune(s) réactivée(s).`,
        `${result.unchangedCommunes} commune(s) déjà présente(s).`,
      ].join(" "),
      "success"
    );
  } catch (error) {
    console.error(
      "Erreur lors de l’importation du CSV :",
      error
    );

    showMessage(
      messageElement,
      error?.message ||
      "Impossible d’importer le fichier CSV.",
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
   79. IMPORT DES ALERTES REGROUPEES
   ========================================================== */

async function importGroupedAlerts(
  groupedAlerts
) {
  const result = {
    createdAlerts: 0,
    updatedAlerts: 0,
    createdCommunes: 0,
    reactivatedCommunes: 0,
    unchangedCommunes: 0,
  };

  const alertCodes =
    groupedAlerts.map(
      (item) =>
        item.alertCode
    );

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
    `)
    .in(
      "alert_code",
      alertCodes
    );

  if (existingAlertsError) {
    throw new Error(
      `Impossible de vérifier les Alertes ID existantes : ${existingAlertsError.message}`
    );
  }

  const existingAlertsMap =
    new Map(
      (existingAlerts || [])
        .map(
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

    let alertId;

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

      const needsActivation =
        existingAlert.is_active ===
        false;

      if (
        regionChanged ||
        needsActivation
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
   80. IMPORT DES COMMUNES
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

  const existingCommunesMap =
    new Map(
      (existingCommunes || [])
        .map(
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
      existingCommunesMap.get(
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
    const {
      error,
    } = await supabase
      .from("alert_communes")
      .insert(
        rowsToInsert
      );

    if (error) {
      throw new Error(
        `Impossible d’ajouter les communes : ${error.message}`
      );
    }

    result.created +=
      rowsToInsert.length;
  }

  return result;
}

/* ==========================================================
   81. REINITIALISATION DE L'IMPORT CSV
   ========================================================== */

function resetAlertCsvImport() {
  const form =
    getElement(
      "alertCsvForm"
    );

  form?.reset();

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
   82. AFFICHAGE ADMINISTRATIF DES DOCUMENTS
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
    tableBody.innerHTML = "";
    return;
  }

  if (
    state.documents.length === 0
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
   83. LIBELLES DES STATUTS
   ========================================================== */

function getDocumentStatusLabel(
  status
) {
  const labels = {
    published:
      "Publié",

    archived:
      "Archivé",

    draft:
      "Brouillon",
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

    archived:
      "status-inactive",

    draft:
      "status-pending",
  };

  return (
    classes[status] ||
    "status-inactive"
  );
}

/* ==========================================================
   84. MODIFICATION DU STATUT D'UN DOCUMENT
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
        "archived = archivé",
        "draft = brouillon",
      ].join("\n"),
      currentStatus
    );

  if (
    requestedStatus === null
  ) {
    return;
  }

  const normalizedStatus =
    requestedStatus
      .trim()
      .toLowerCase();

  const allowedStatuses = [
    "published",
    "archived",
    "draft",
  ];

  if (
    !allowedStatuses.includes(
      normalizedStatus
    )
  ) {
    window.alert(
      "Statut invalide. Utilisez published, archived ou draft."
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
}

/* ==========================================================
   85. SELECTION DU FICHIER DE REMPLACEMENT
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
   86. TRAITEMENT DU FICHIER DE REMPLACEMENT
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
    validatePdf(file);
  } catch (error) {
    window.alert(
      error?.message ||
      "Le fichier sélectionné est invalide."
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
   87. REMPLACEMENT DU DOCUMENT
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

  let uploaded =
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

    uploaded = true;

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

    window.alert(
      "Le document a été remplacé avec succès."
    );

    await loadDocuments();
  } catch (error) {
    if (uploaded) {
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
      error?.message ||
      "Impossible de remplacer le document."
    );
  }
}

/* ==========================================================
   88. SUPPRESSION DU DOCUMENT
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
        "La fiche a été supprimée, mais le fichier Storage est resté présent :",
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
  }

  await loadDocuments();
}

/* ==========================================================
   89. ACTIONS DU TABLEAU DES DOCUMENTS
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
      break;
  }
}
/* ==========================================================
   90. INITIALISATION DES EVENEMENTS
   ========================================================== */

function initializeEvents() {
  /*
   * Navigation principale et onglets administratifs.
   */
  initializeNavigation();
  initializeAdminTabs();

  /* --------------------------------------------------------
     Authentification
     -------------------------------------------------------- */

  getElement("loginButton")
    ?.addEventListener(
      "click",
      openLoginModal
    );

  getElement("logoutButton")
    ?.addEventListener(
      "click",
      handleLogout
    );

  getElement("closeLoginModal")
    ?.addEventListener(
      "click",
      closeLoginModal
    );

  getElement("cancelLoginButton")
    ?.addEventListener(
      "click",
      closeLoginModal
    );

  getElement("loginForm")
    ?.addEventListener(
      "submit",
      handleAdminLogin
    );

  /*
   * Fermeture de la modale en cliquant
   * sur l’arrière-plan.
   */
  getElement("loginModal")
    ?.addEventListener(
      "click",
      (event) => {
        const backdrop =
          event.target.closest(
            ".modal-backdrop"
          );

        if (backdrop) {
          closeLoginModal();
        }
      }
    );

  /*
   * Fermeture de la modale avec Échap.
   */
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
    () => {
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
     Administration des organisations
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
    resetOrganizationForm
  );

  getElement(
    "adminOrganizationsTable"
  )?.addEventListener(
    "click",
    handleAdminOrganizationTableClick
  );

  /* --------------------------------------------------------
     Administration des Alertes ID
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
    resetAlertForm
  );

  getElement(
    "adminAlertsTable"
  )?.addEventListener(
    "click",
    handleAdminAlertTableClick
  );

  /* --------------------------------------------------------
     Import CSV
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
    resetAlertCsvImport
  );

  getElement(
    "alertCsvFile"
  )?.addEventListener(
    "change",
    () => {
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
     Actualisation complète de l’administration
     -------------------------------------------------------- */

  getElement(
    "refreshAdminButton"
  )?.addEventListener(
    "click",
    refreshAdminData
  );
}

/* ==========================================================
   91. ACTUALISATION COMPLETE DE L'ADMINISTRATION
   ========================================================== */

async function refreshAdminData() {
  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const button =
    getElement(
      "refreshAdminButton"
    );

  setButtonLoading(
    button,
    true,
    "Actualisation..."
  );

  hideMessage(
    getElement(
      "adminGlobalMessage"
    )
  );

  try {
    await refreshApplicationData();

    showMessage(
      getElement(
        "adminGlobalMessage"
      ),
      "Les données ont été actualisées avec succès.",
      "success"
    );
  } catch (error) {
    console.error(
      "Erreur d’actualisation administrative :",
      error
    );

    showMessage(
      getElement(
        "adminGlobalMessage"
      ),
      error?.message ||
      "Impossible d’actualiser les données.",
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
   92. ACTUALISATION COMPLETE DE L'APPLICATION
   ========================================================== */

async function refreshApplicationData() {
  const referenceErrors =
    await loadPublicReferenceData();

  await loadDocuments();

  if (state.isAdmin) {
    await loadAdminData();
  }

  updatePublishSummary();

  if (
    referenceErrors.length > 0
  ) {
    throw new Error(
      referenceErrors
        .map(
          (error) =>
            error?.message ||
            String(error)
        )
        .join(" ")
    );
  }
}

/* ==========================================================
   93. ETAT DE CHARGEMENT INITIAL
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
   94. AFFICHAGE DES ERREURS D'INITIALISATION
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

  if (!errorContainer) {
    window.alert(
      error?.message ||
      "Impossible de démarrer l’application."
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
          error?.message ||
          "Une erreur inattendue est survenue."
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
    () => {
      window.location.reload();
    }
  );
}

/* ==========================================================
   95. MASQUAGE DES ERREURS D'INITIALISATION
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
   96. VALIDATION DE LA CONFIGURATION
   ========================================================== */

function validateConfiguration() {
  const missingValues = [];

  if (
    !CONFIG.SUPABASE_URL ||
    CONFIG.SUPABASE_URL.includes(
      "VOTRE-PROJET"
    )
  ) {
    missingValues.push(
      "SUPABASE_URL"
    );
  }

  if (
    !CONFIG.SUPABASE_PUBLISHABLE_KEY ||
    CONFIG.SUPABASE_PUBLISHABLE_KEY.includes(
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

  if (
    String(
      CONFIG.SUPABASE_PUBLISHABLE_KEY
    ).startsWith(
      "sb_secret_"
    )
  ) {
    throw new Error(
      "Une clé secrète Supabase ne doit jamais être utilisée dans le navigateur."
    );
  }

  const maxFileSize =
    Number(
      CONFIG.MAX_FILE_SIZE
    );

  if (
    !Number.isFinite(
      maxFileSize
    ) ||
    maxFileSize <= 0
  ) {
    throw new Error(
      "La valeur CONFIG.MAX_FILE_SIZE est invalide."
    );
  }
}

/* ==========================================================
   97. PREPARATION DE L'INTERFACE
   ========================================================== */

function initializeInterface() {
  resetPublishForm();
  resetOrganizationForm();
  resetAlertForm();
  resetAlertCsvImport();
  resetDocumentFilters();

  updateAuthenticationInterface();
  updatePublishSummary();

  /*
   * L’onglet Organisations est l’onglet
   * administratif affiché par défaut.
   */
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
   98. CHARGEMENT INITIAL DES DONNEES
   ========================================================== */

async function loadInitialData() {
  const referenceErrors =
    await loadPublicReferenceData();

  try {
    await loadDocuments();
  } catch (error) {
    console.error(
      "Erreur de chargement des documents :",
      error
    );

    referenceErrors.push(
      error
    );
  }

  if (state.isAdmin) {
    try {
      await loadAdminData();

      /*
       * Recharger les documents après les données
       * administratives permet d’enrichir les fiches
       * utilisant des alertes ou communes inactives.
       */
      state.documents =
        enrichDocuments(
          state.documents
        );

      renderDocuments();
      renderStatistics();
      populateDocumentFilters();
      renderAdminDocuments();
    } catch (error) {
      console.error(
        "Erreur de chargement de l’administration :",
        error
      );

      referenceErrors.push(
        error
      );
    }
  }

  if (
    referenceErrors.length > 0
  ) {
    showInitializationError(
      new Error(
        referenceErrors
          .map(
            (error) =>
              error?.message ||
              String(error)
          )
          .join(" ")
      )
    );
  }
}

/* ==========================================================
   99. DEMARRAGE DE L'APPLICATION
   ========================================================== */

async function initializeApplication() {
  if (state.initialized) {
    return;
  }

  state.initialized = true;

  setInitialLoadingState(
    true
  );

  clearInitializationError();

  try {
    validateConfiguration();

    initializeEvents();

    await initializeAuthentication();

    initializeInterface();

    await loadInitialData();
  } catch (error) {
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
   100. LANCEMENT APRES CHARGEMENT DU DOM
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
