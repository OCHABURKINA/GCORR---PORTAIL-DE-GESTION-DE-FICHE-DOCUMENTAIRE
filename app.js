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
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

/* ==========================================================
   2. ETAT GLOBAL DE L'APPLICATION
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

  selectedPublishAlert: null,
  selectedPublishCommune: null,
};

/* ==========================================================
   3. OUTILS GENERAUX
   ========================================================== */

function getElement(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeFileName(fileName) {
  const lastDotIndex = fileName.lastIndexOf(".");

  const extension =
    lastDotIndex >= 0
      ? fileName
          .slice(lastDotIndex)
          .toLowerCase()
      : ".pdf";

  const baseName =
    lastDotIndex >= 0
      ? fileName.slice(0, lastDotIndex)
      : fileName;

  const safeBaseName =
    slugify(baseName) || "document";

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

  let value = numericValue;
  let unitIndex = 0;

  while (
    value >= 1024 &&
    unitIndex < units.length - 1
  ) {
    value /= 1024;
    unitIndex += 1;
  }

  const decimals =
    unitIndex === 0 ? 0 : 1;

  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(
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

function showMessage(
  element,
  message,
  type = "success"
) {
  if (!element) {
    return;
  }

  element.textContent = message;
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
        button.textContent;
    }

    button.disabled = true;
    button.textContent =
      loadingText;
  } else {
    button.disabled = false;

    button.textContent =
      button.dataset.originalText ||
      button.textContent;
  }
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

  const isPdf =
    file.type === "application/pdf" ||
    extension === "pdf";

  if (!isPdf) {
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
      "La taille maximale autorisée est de 20 Mo."
    );
  }
}

function getPublicUrl(storagePath) {
  if (!storagePath) {
    return "";
  }

  const {
    data,
  } = supabase.storage
    .from(CONFIG.STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  return data?.publicUrl || "";
}

function uniqueValues(values) {
  return [
    ...new Set(
      values
        .map((value) =>
          String(value ?? "").trim()
        )
        .filter(Boolean)
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

function getAlertById(alertId) {
  return state.alerts.find(
    (item) =>
      item.id === alertId
  ) || null;
}

function getAlertCommuneById(
  alertCommuneId
) {
  return state.alertCommuneOptions.find(
    (item) =>
      item.alert_commune_id ===
      alertCommuneId
  ) || null;
}

function getAlertCommunes(
  alertId,
  activeOnly = true
) {
  return state.alertCommuneOptions.filter(
    (item) => {
      const matchesAlert =
        item.alert_id === alertId;

      if (!activeOnly) {
        return matchesAlert;
      }

      return (
        matchesAlert &&
        item.alert_is_active &&
        item.alert_commune_is_active
      );
    }
  );
}

/* ==========================================================
   4. NAVIGATION
   ========================================================== */

function showView(viewName) {
  if (
    viewName === "admin" &&
    !state.isAdmin
  ) {
    openLoginModal();
    return;
  }

  document
    .querySelectorAll(".view")
    .forEach((view) => {
      view.classList.remove(
        "active-view"
      );
    });

  const targetView =
    getElement(`${viewName}View`);

  if (targetView) {
    targetView.classList.add(
      "active-view"
    );
  }

  document
    .querySelectorAll(
      ".nav-button"
    )
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

  if (viewName === "documents") {
    renderDocuments();
  }

  if (
    viewName === "admin" &&
    state.isAdmin
  ) {
    loadAdminData();
  }
}

function initializeNavigation() {
  document
    .querySelectorAll("[data-view]")
    .forEach((element) => {
      element.addEventListener(
        "click",
        () => {
          showView(
            element.dataset.view
          );
        }
      );
    });
}

/* ==========================================================
   5. AUTHENTIFICATION ADMINISTRATEUR
   ========================================================== */

async function initializeAuthentication() {
  const {
    data,
    error,
  } =
    await supabase.auth.getSession();

  if (error) {
    console.error(
      "Erreur session :",
      error
    );
  }

  state.session =
    data?.session || null;

  await checkAdminStatus();

  supabase.auth.onAuthStateChange(
    async (_event, session) => {
      state.session = session;

      await checkAdminStatus();

      try {
        await loadDocuments();

        if (state.isAdmin) {
          await loadAdminData();
        }
      } catch (error) {
        console.error(
          "Erreur après changement de session :",
          error
        );
      }
    }
  );
}

async function checkAdminStatus() {
  state.isAdmin = false;
  state.adminProfile = null;

  if (!state.session?.user?.id) {
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
      state.session.user.id
    )
    .maybeSingle();

  if (error) {
    console.error(
      "Erreur vérification administrateur :",
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

function updateAuthenticationInterface() {
  const loginButton =
    getElement("loginButton");

  const logoutButton =
    getElement("logoutButton");

  document
    .querySelectorAll(".admin-only")
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
  } else {
    adminIdentity.textContent = "";
  }
}

function openLoginModal() {
  const modal =
    getElement("loginModal");

  if (!modal) {
    return;
  }

  modal.classList.remove("hidden");

  modal.setAttribute(
    "aria-hidden",
    "false"
  );

  window.setTimeout(() => {
    getElement("adminEmail")
      ?.focus();
  }, 100);
}

function closeLoginModal() {
  const modal =
    getElement("loginModal");

  if (!modal) {
    return;
  }

  modal.classList.add("hidden");

  modal.setAttribute(
    "aria-hidden",
    "true"
  );

  hideMessage(
    getElement("loginMessage")
  );
}

async function handleAdminLogin(event) {
  event.preventDefault();

  const loginButton =
    event.submitter;

  const messageElement =
    getElement("loginMessage");

  hideMessage(messageElement);

  const email =
    getElement("adminEmail")
      ?.value
      .trim();

  const password =
    getElement("adminPassword")
      ?.value;

  if (!email || !password) {
    showMessage(
      messageElement,
      "Veuillez renseigner l’adresse e-mail et le mot de passe.",
      "error"
    );

    return;
  }

  setButtonLoading(
    loginButton,
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
      data.session;

    await checkAdminStatus();

    if (!state.isAdmin) {
      await supabase.auth.signOut();

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
      error.message ||
        "Connexion impossible.",
      "error"
    );
  } finally {
    setButtonLoading(
      loginButton,
      false
    );
  }
}

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

  updateAuthenticationInterface();

  showView("home");
}

/* ==========================================================
   6. CHARGEMENT DES ORGANISATIONS PUBLIQUES
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
    .eq("is_active", true)
    .order("name", {
      ascending: true,
    });

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
   7. CHARGEMENT DES ALERTES ET COMMUNES PUBLIQUES
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
    .eq("is_active", true)
    .order("alert_code", {
      ascending: true,
    });

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
      alert_is_active,
      commune,
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
    .order("alert_code", {
      ascending: true,
    })
    .order("commune", {
      ascending: true,
    });

  if (error) {
    throw new Error(
      `Impossible de charger les communes des alertes : ${error.message}`
    );
  }

  state.alertCommuneOptions =
    data || [];

  populateAlertFilters();
}

/* ==========================================================
   8. REMPLISSAGE DES LISTES DEROULANTES
   ========================================================== */

function populateOrganizationSelects() {
  const selectConfigurations = [
    {
      id: "publishOrganization",
      label:
        "Sélectionner une organisation",
    },
    {
      id: "filterOrganization",
      label:
        "Toutes les organisations",
    },
  ];

  selectConfigurations.forEach(
    ({ id, label }) => {
      const select =
        getElement(id);

      if (!select) {
        return;
      }

      const currentValue =
        select.value;

      select.innerHTML =
        `<option value="">${escapeHtml(label)}</option>`;

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

      if (
        state.organizations.some(
          (organization) =>
            organization.id ===
            currentValue
        )
      ) {
        select.value =
          currentValue;
      }
    }
  );
}

function populatePublishAlertSelect() {
  const select =
    getElement("publishAlert");

  if (!select) {
    return;
  }

  const currentValue =
    select.value;

  select.innerHTML = `
    <option value="">
      Sélectionner une Alerte ID
    </option>
  `;

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

      select.appendChild(option);
    }
  );

  select.disabled =
    state.alerts.length === 0;

  if (
    state.alerts.some(
      (alertItem) =>
        alertItem.id ===
        currentValue
    )
  ) {
    select.value =
      currentValue;
  }
}

function populateAlertFilters() {
  const alertSelect =
    getElement("filterAlert");

  if (!alertSelect) {
    return;
  }

  const currentValue =
    alertSelect.value;

  alertSelect.innerHTML = `
    <option value="">
      Toutes les alertes
    </option>
  `;

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

      alertSelect.appendChild(option);
    }
  );

  if (
    state.alerts.some(
      (alertItem) =>
        alertItem.alert_code ===
        currentValue
    )
  ) {
    alertSelect.value =
      currentValue;
  }
}

function populatePublishCommuneSelect(
  alertId
) {
  const communeSelect =
    getElement("publishCommune");

  if (!communeSelect) {
    return;
  }

  communeSelect.innerHTML = `
    <option value="">
      Sélectionner une commune
    </option>
  `;

  if (!alertId) {
    communeSelect.disabled = true;

    communeSelect.innerHTML = `
      <option value="">
        Sélectionner d’abord une Alerte ID
      </option>
    `;

    return;
  }

  const matchingCommunes =
    getAlertCommunes(alertId);

  matchingCommunes.forEach(
    (item) => {
      const option =
        document.createElement(
          "option"
        );

      option.value =
        item.alert_commune_id;

      option.textContent =
        item.commune;

      communeSelect.appendChild(
        option
      );
    }
  );

  if (
    matchingCommunes.length === 0
  ) {
    communeSelect.disabled = true;

    communeSelect.innerHTML = `
      <option value="">
        Aucune commune disponible
      </option>
    `;
  } else {
    communeSelect.disabled = false;
  }
}
/* ==========================================================
   9. FORMULAIRE PUBLIC DE PUBLICATION
   ========================================================== */

/**
 * Réinitialise les informations liées à l’alerte
 * et à la commune sélectionnées.
 */
function resetPublishAlertSelection() {
  state.selectedPublishAlert = null;
  state.selectedPublishCommune = null;

  const alertSelect =
    getElement("publishAlert");

  const regionInput =
    getElement("publishRegion");

  const communeSelect =
    getElement("publishCommune");

  if (alertSelect) {
    alertSelect.value = "";
  }

  if (regionInput) {
    regionInput.value = "";
  }

  if (communeSelect) {
    communeSelect.disabled = true;

    communeSelect.innerHTML = `
      <option value="">
        Sélectionner d’abord une Alerte ID
      </option>
    `;
  }
}

/**
 * Réinitialise uniquement les métadonnées
 * Région et Commune.
 */
function resetPublishMetadata() {
  state.selectedPublishAlert = null;
  state.selectedPublishCommune = null;

  const regionInput =
    getElement("publishRegion");

  const communeSelect =
    getElement("publishCommune");

  if (regionInput) {
    regionInput.value = "";
  }

  if (communeSelect) {
    communeSelect.disabled = true;

    communeSelect.innerHTML = `
      <option value="">
        Sélectionner d’abord une Alerte ID
      </option>
    `;
  }
}

/**
 * L’organisation est indépendante de l’alerte.
 * Son changement ne filtre donc plus les Alertes ID.
 */
function handlePublishOrganizationChange() {
  updatePublishSummary();
}

/**
 * Lorsqu’une alerte est sélectionnée :
 * - la région est affichée automatiquement ;
 * - les communes associées sont chargées ;
 * - la commune précédemment sélectionnée est réinitialisée.
 */
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

  updatePublishSummary();
}

/**
 * Enregistre la commune sélectionnée dans l’état global.
 */
function handlePublishCommuneChange() {
  const alertCommuneId =
    getElement("publishCommune")
      ?.value || "";

  state.selectedPublishCommune =
    getAlertCommuneById(
      alertCommuneId
    );

  /*
   * Vérification de cohérence :
   * la commune sélectionnée doit appartenir
   * à l’alerte actuellement sélectionnée.
   */
  if (
    state.selectedPublishCommune &&
    state.selectedPublishAlert &&
    state.selectedPublishCommune
      .alert_id !==
      state.selectedPublishAlert.id
  ) {
    state.selectedPublishCommune =
      null;

    const communeSelect =
      getElement("publishCommune");

    if (communeSelect) {
      communeSelect.value = "";
    }
  }

  updatePublishSummary();
}

/**
 * Gère la sélection du fichier PDF.
 */
function handlePublishFileChange() {
  const fileInput =
    getElement("publishFile");

  const file =
    fileInput?.files?.[0];

  const fileInfo =
    getElement(
      "selectedFileInfo"
    );

  if (!fileInfo) {
    updatePublishSummary();
    return;
  }

  if (!file) {
    fileInfo.classList.add(
      "hidden"
    );

    fileInfo.innerHTML = "";

    updatePublishSummary();
    return;
  }

  try {
    validatePdf(file);

    fileInfo.innerHTML = `
      <strong>
        ${escapeHtml(file.name)}
      </strong>

      <span>
        ${formatFileSize(file.size)}
      </span>
    `;

    fileInfo.classList.remove(
      "hidden"
    );
  } catch (error) {
    if (fileInput) {
      fileInput.value = "";
    }

    fileInfo.classList.add(
      "hidden"
    );

    fileInfo.innerHTML = "";

    window.alert(
      error.message
    );
  }

  updatePublishSummary();
}

/**
 * Met à jour le résumé affiché
 * avant la publication.
 */
function updatePublishSummary() {
  const organizationId =
    getElement(
      "publishOrganization"
    )?.value || "";

  const organization =
    state.organizations.find(
      (item) =>
        item.id === organizationId
    ) || null;

  const file =
    getElement("publishFile")
      ?.files?.[0];

  const summaryOrganization =
    getElement(
      "summaryOrganization"
    );

  const summaryAlert =
    getElement("summaryAlert");

  const summaryRegion =
    getElement("summaryRegion");

  const summaryCommune =
    getElement("summaryCommune");

  const summaryFile =
    getElement("summaryFile");

  if (summaryOrganization) {
    summaryOrganization.textContent =
      organization?.name || "—";
  }

  if (summaryAlert) {
    summaryAlert.textContent =
      state.selectedPublishAlert
        ?.alert_code || "—";
  }

  if (summaryRegion) {
    summaryRegion.textContent =
      state.selectedPublishAlert
        ?.region || "—";
  }

  if (summaryCommune) {
    summaryCommune.textContent =
      state.selectedPublishCommune
        ?.commune || "—";
  }

  if (summaryFile) {
    summaryFile.textContent =
      file?.name || "—";
  }
}

/* ==========================================================
   10. BARRE DE PROGRESSION DE PUBLICATION
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

  if (!wrapper || !bar || !text) {
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

  wrapper?.classList.add(
    "hidden"
  );

  if (bar) {
    bar.style.width = "0%";
  }

  if (text) {
    text.textContent = "0 %";
  }
}

/* ==========================================================
   11. GENERATION DU CHEMIN STORAGE
   ========================================================== */

/**
 * Construit un chemin Storage lisible et unique :
 *
 * organisation/
 * alerte/
 * commune/
 * fichier.pdf
 */
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
    ) || "organisation";

  const alertFolder =
    slugify(
      alertOption.alert_code
    ) || "alerte";

  const communeFolder =
    slugify(
      communeOption.commune
    ) || "commune";

  const safeFileName =
    sanitizeFileName(
      file.name
    );

  const uniqueFileName =
    [
      Date.now(),
      crypto.randomUUID(),
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
   12. VALIDATION DU FORMULAIRE DE PUBLICATION
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

  if (
    communeOption.region &&
    alertOption.region &&
    communeOption.region !==
      alertOption.region
  ) {
    throw new Error(
      "La région de la commune ne correspond pas à celle de l’alerte."
    );
  }

  validatePdf(file);
}

/* ==========================================================
   13. PUBLICATION DU DOCUMENT
   ========================================================== */

async function handlePublicPublication(
  event
) {
  event.preventDefault();

  const messageElement =
    getElement("publishMessage");

  const submitButton =
    event.submitter ||
    getElement(
      "publishSubmitButton"
    );

  hideMessage(
    messageElement
  );

  let uploadedStoragePath =
    null;

  let documentInserted =
    false;

  try {
    const organizationId =
      getElement(
        "publishOrganization"
      )?.value || "";

    const alertId =
      getElement("publishAlert")
        ?.value || "";

    const alertCommuneId =
      getElement("publishCommune")
        ?.value || "";

    const file =
      getElement("publishFile")
        ?.files?.[0];

    const organization =
      state.organizations.find(
        (item) =>
          item.id ===
          organizationId
      ) || null;

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

    /*
     * Maintien de l’état global
     * avant le début de l’opération.
     */
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

    /*
     * Étape 1 : chargement du PDF
     * dans Supabase Storage.
     */
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
          cacheControl: "3600",
          contentType:
            "application/pdf",
          upsert: false,
        }
      );

    if (uploadError) {
      throw new Error(
        `Chargement du fichier impossible : ${uploadError.message}`
      );
    }

    updatePublishProgress(65);

    /*
     * Étape 2 : enregistrement
     * des métadonnées.
     *
     * Aucun secteur ni aucune province
     * n’est enregistré.
     */
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
        "published",

      uploaded_by:
        state.session
          ?.user
          ?.id || null,
    };

    const {
      error: insertError,
    } = await supabase
      .from("documents")
      .insert(
        documentRecord
      );

    if (insertError) {
      /*
       * Annulation du chargement Storage
       * lorsque l’écriture dans la base échoue.
       */
      const {
        error: rollbackError,
      } = await supabase.storage
        .from(
          CONFIG.STORAGE_BUCKET
        )
        .remove([
          storagePath,
        ]);

      if (rollbackError) {
        console.warn(
          "Le fichier chargé n’a pas pu être supprimé après l’échec de l’enregistrement :",
          rollbackError.message
        );
      } else {
        uploadedStoragePath =
          null;
      }

      throw new Error(
        `Enregistrement des métadonnées impossible : ${insertError.message}`
      );
    }

    documentInserted = true;

    updatePublishProgress(100);

    showMessage(
      messageElement,
      "La fiche a été publiée avec succès.",
      "success"
    );

    /*
     * Réinitialisation complète
     * du formulaire.
     */
    resetPublishForm();

    /*
     * Actualisation de la liste publique
     * et des statistiques.
     */
    await loadDocuments();
  } catch (error) {
    if (
      uploadedStoragePath &&
      !documentInserted
    ) {
      console.warn(
        "Un fichier peut être resté dans Supabase Storage :",
        uploadedStoragePath
      );
    }

    showMessage(
      messageElement,
      error.message ||
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
   14. REINITIALISATION DU FORMULAIRE DE PUBLICATION
   ========================================================== */

function resetPublishForm() {
  const form =
    getElement("publishForm");

  form?.reset();

  state.selectedPublishAlert =
    null;

  state.selectedPublishCommune =
    null;

  const alertSelect =
    getElement("publishAlert");

  const regionInput =
    getElement("publishRegion");

  const communeSelect =
    getElement("publishCommune");

  const fileInfo =
    getElement(
      "selectedFileInfo"
    );

  /*
   * Les alertes restent accessibles,
   * car elles ne dépendent plus
   * de l’organisation.
   */
  if (alertSelect) {
    alertSelect.value = "";

    alertSelect.disabled =
      state.alerts.length === 0;
  }

  if (regionInput) {
    regionInput.value = "";
  }

  if (communeSelect) {
    communeSelect.value = "";
    communeSelect.disabled = true;

    communeSelect.innerHTML = `
      <option value="">
        Sélectionner d’abord une Alerte ID
      </option>
    `;
  }

  if (fileInfo) {
    fileInfo.classList.add(
      "hidden"
    );

    fileInfo.innerHTML = "";
  }

  updatePublishSummary();
}
