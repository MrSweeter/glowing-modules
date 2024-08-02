const gistSource =
    'https://gist.githubusercontent.com/GaetanVandenBergh/35a02a7148d9919a9aea76796d824d63/raw/glowing-modules-diff.json';

let compareMode = false;
let history = {};

async function onDOMContentLoaded() {
    for (element of document.getElementsByClassName('copyright-year')) {
        element.innerText = new Date().getFullYear();
    }
    document.getElementById('footer-data-source').href = gistSource.slice(
        0,
        gistSource.lastIndexOf('/', gistSource.lastIndexOf('/') - 1)
    );

    await reload();

    handleSearch();
    handleLTSToggle();
}

document.removeEventListener('DOMContentLoaded', onDOMContentLoaded);
document.addEventListener('DOMContentLoaded', onDOMContentLoaded);

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/difference
Array.prototype.gm_difference = function (iterable) {
    let difference = Array.from(this);
    for (const elem of iterable) {
        difference = difference.filter((e) => e !== elem);
    }
    return difference;
};

async function reload() {
    const diff = await loadDifference();
    const onlyLTS = document.getElementById('onlyLTSToggle').checked;
    if (onlyLTS) {
        for (const version of Object.keys(diff)) {
            if (version.startsWith('saas')) delete diff[version];
        }
    }

    history = generateModuleHistory(diff);
    loadVersionsMenu(diff);
    loadModeSwitch(diff);

    if (window.location.search.includes('compare')) {
        const modeSwitchElement = document.getElementById('mode-switch');
        modeSwitchElement.click();
    }
}

function loadModeSwitch(diff) {
    const modeSwitchElement = document.getElementById('mode-switch');
    modeSwitchElement.onclick = () => {
        document.getElementById('menu-compare').classList.toggle('d-none');
        document.getElementById('side-menu-all').classList.toggle('d-none');
        document.getElementById('modules-list').classList.toggle('sidebar-offset');

        document.getElementById('mode-switch-icon').classList.toggle('fa-code-commit');
        document.getElementById('mode-switch-icon').classList.toggle('fa-code-compare');

        if (compareMode) {
            loadVersionsMenu(diff);
        } else {
            onComparatorChange(diff);
        }
        compareMode = !compareMode;
    };
}

function loadVersionsMenu(diff) {
    const sideMenuVersionElement = document.getElementById('side-menu-version');
    sideMenuVersionElement.innerHTML = '';

    const versionSelectorElement = document.getElementById('version-selector');
    versionSelectorElement.innerHTML = '';

    for (const version of Object.keys(diff)) {
        // List
        const stable = sanitizeVersionToFloat(version) === sanitizeVersionToInteger(version);
        const versionMenuItem = stringToHTML(`
            <a
                id=${getVersionID(version)}
                style="cursor: pointer"
                class="side-version-item list-group-item list-group-item-action py-2 ripple ${stable ? '' : 'ps-5'}"
            >
                <i class="fas fa-${stable ? 'code-branch' : 'code-branch'} fa-fw me-3 opacity-50"></i><span>${version}</span>
            </a>
        `);

        versionMenuItem.onclick = () => onVersionChange(version, diff);
        sideMenuVersionElement.prepend(versionMenuItem);

        // Selector
        const versionSelectorItem = stringToHTML(
            `<button data-version="${version}" class="version-selector-item btn btn-${
                stable ? 'primary' : 'secondary'
            } m-2">${version}</button>`
        );

        versionSelectorItem.onclick = () => onVersionSelected(version, diff);
        versionSelectorElement.prepend(versionSelectorItem);
    }

    // Selector toggler
    const toSelectorToggleElement = document.getElementById('version-select-to-toggle');
    const toSelectorToggleMobileElement = document.getElementById('version-select-to-mobile-toggle');
    const fromSelectorToggleElement = document.getElementById('version-select-from-toggle');

    toSelectorToggleElement.onclick = () => {
        versionSelectorElement.dataset.mode = 'to';
        toggleOverlay(true);
    };
    toSelectorToggleMobileElement.onclick = () => {
        versionSelectorElement.dataset.mode = 'to-mobile';
        toggleOverlay(true);
    };
    fromSelectorToggleElement.onclick = () => {
        versionSelectorElement.dataset.mode = 'from';
        toggleOverlay(true);
    };

    // Default load
    const [previous, current] = Object.keys(diff).slice(-2);
    onVersionChange(current, diff);
    updateVersionToggle(toSelectorToggleElement, current);
    updateVersionToggle(toSelectorToggleMobileElement, current);
    updateVersionToggle(fromSelectorToggleElement, previous);
}

function onVersionSelected(version, diff) {
    const selectorElement = document.getElementById('version-selector');
    const mode = selectorElement.dataset.mode;
    const toggleElement = document.getElementById(`version-select-${mode}-toggle`);
    updateVersionToggle(toggleElement, version);

    toggleOverlay(false);
    mode === 'to-mobile' ? onVersionChange(version, diff) : onComparatorChange(diff);
}

function updateVersionToggle(element, version) {
    element.dataset.version = version;
    element.innerHTML = version;
}

function onVersionChange(version, diff) {
    for (const e of document.getElementsByClassName('side-version-item')) {
        e.classList.remove('active');
    }
    document.getElementById(getVersionID(version)).classList.add('active');
    updateVersionToggle(document.getElementById('version-select-to-mobile-toggle'), version);

    compareVersion(diff, version);
}

function onComparatorChange(diff) {
    const versionSelectFromElement = document.getElementById('version-select-from-toggle');
    let fromValue = versionSelectFromElement.dataset.version;
    const versionSelectToElement = document.getElementById('version-select-to-toggle');
    let toValue = versionSelectToElement.dataset.version;

    // from lower to upper
    if (sanitizeVersionToFloat(toValue) < sanitizeVersionToFloat(fromValue)) {
        updateVersionToggle(versionSelectFromElement, toValue);
        updateVersionToggle(versionSelectToElement, fromValue);

        fromValue = versionSelectFromElement.dataset.version;
        toValue = versionSelectToElement.dataset.version;
    }

    compareVersion(diff, toValue, fromValue);
}

function compareVersion(diff, toValue, fromValueArg = undefined) {
    const added = {};
    const removed = {};

    // from lower to upper
    const versions = Object.keys(diff).sort((a, b) => sanitizeVersionToFloat(a) - sanitizeVersionToFloat(b));

    const indexOfTo = versions.indexOf(toValue);
    const fromValue = fromValueArg ?? versions[indexOfTo - 1];
    const indexOfFrom = versions.indexOf(fromValue);

    for (let i = indexOfFrom + 1; i <= indexOfTo; i++) {
        const version = versions[i];

        const vcontent = diff[version];

        for (const [repo, content] of Object.entries(vcontent)) {
            added[repo] = (added[repo] || []).concat(content['+'] || []).gm_difference(content['-'] || []);
            removed[repo] = (removed[repo] || []).concat(content['-'] || []).gm_difference(content['+'] || []);
        }
    }

    const modulesAddedContentElement = document.getElementById('modules-added-content');

    document.getElementById('added-count').innerText = loadList(modulesAddedContentElement, added, 'success');

    const modulesRemovedContentElement = document.getElementById('modules-removed-content');
    document.getElementById('removed-count').innerText = loadList(modulesRemovedContentElement, removed, 'danger');

    for (const e of document.getElementsByClassName('tooltip-version-from')) {
        e.innerText = fromValue;
    }
    for (const e of document.getElementsByClassName('tooltip-version-to')) {
        e.innerText = toValue;
    }

    searchModule();
    highlightSearch();
}

function highlightSearch() {
    const element = document.getElementById('searchInput');
    if (!element.value) return;
    element.classList.add('highlight');
    setTimeout(() => element.classList.remove('highlight'), 1000);
}

function loadList(container, repos, style) {
    container.innerHTML = '';
    let count = 0;

    const owners = new Set(Object.keys(repos).map(k => k.split('/')[0]))
    const uniqueOwner = owners.size === 1

    for (const [repo, content] of Object.entries(repos)) {
        if (content.length) {
            count += content.length;
            const [owner, repoName] = repo.split('/')
            const repoContainer = stringToHTML(
                `<div class="badge-container w-100" data-owner="${owner}" data-repo="${repoName}"></div>`
            );
            const sectionElement = stringToHTML(`
                <h5 class="mx-2 my-1 w-100"><span class="badge badge-primary w-100">${uniqueOwner ? repoName : repo} <span class="small fw-normal text-white-50">(${content.length})</span></span></h5>
            `);
            repoContainer.appendChild(sectionElement);

            for (const m of content) {
                const moduleHistory = history[m]?.join('\n');
                const listItem = stringToHTML(`
                    <span class="badge badge-module badge-${style} mx-2 my-1" title="${moduleHistory}" data-module=${m}>${m}</span>
                `);
                repoContainer.appendChild(listItem);
            }
            container.appendChild(repoContainer);
        }
    }
    return count;
}

function generateModuleHistory(diff) {
    const history = {};
    for (const [version, vcontent] of Object.entries(diff)) {
        for (const [repo, content] of Object.entries(vcontent)) {
            for (const [action, modules] of Object.entries(content)) {
                for (const module of modules) {
                    history[module] = history[module] || [];
                    history[module].push(`${repo}/${version}/${action}`);
                }
            }
        }
    }
    return history;
}

function toggleOverlay(show) {
    const overlayContainer = document.getElementById('overlay-container');
    overlayContainer.classList.toggle('active', show);

    function close(event) {
        const versionSelectorElement = document.getElementById('version-selector');
        if (!versionSelectorElement.contains(event.target)) toggleOverlay(false);
    }

    if (show) {
        overlayContainer.addEventListener('click', close);
    } else {
        overlayContainer.removeEventListener('click', close);
    }
}

function handleLTSToggle() {
    const onlyLTSInput = document.getElementById('onlyLTSToggle');
    onlyLTSInput.onchange = (e) => {
        reload();
    };
}

function handleSearch() {
    const searchInput = document.getElementById('searchInput');
    searchInput.removeEventListener('input', searchModule);
    searchInput.addEventListener('input', searchModule);

    document.getElementById('clearInput').onclick = () => {
        searchInput.value = '';
        searchModule();
    };
}

const ownerRegex = new RegExp(/^owner:.+/);
const repositoryRegex = new RegExp(/^repository:.+/);

function searchModule() {
    const searchInput = document.getElementById('searchInput');

    const terms = searchInput.value.split(/\s/);
    const ownerRegexTerm = sanitizeSearchTerm(terms.find((t) => ownerRegex.test(t))?.split(':')[1]);
    const repositoryRegexTerm = sanitizeSearchTerm(terms.find((t) => repositoryRegex.test(t))?.split(':')[1]);
    const moduleRegexTerm = sanitizeSearchTerm(terms.find((t) => !t.includes(':')));

    const allBadgeModule = document.getElementsByClassName('badge-module');

    for (const element of allBadgeModule) {
        const isVisible = moduleRegexTerm?.test(element.dataset.module) ?? true;
        if (isVisible) element.classList.remove('d-none');
        else element.classList.add('d-none');
    }

    const allRepositoryElement = document.getElementsByClassName('badge-container');
    const hasOwnerRegexTerm = !!ownerRegexTerm;
    const hasRepositoryRegexTerm = !!repositoryRegexTerm;

    for (const element of allRepositoryElement) {
        const isVisibleOwner = !hasOwnerRegexTerm || ownerRegexTerm.test(element.dataset.owner);
        const isVisibleRepository = !hasRepositoryRegexTerm || repositoryRegexTerm.test(element.dataset.repo);

        const isVisible = isVisibleOwner && isVisibleRepository;
        if (isVisible) element.classList.remove('d-none');
        else element.classList.add('d-none');
    }
}

function sanitizeSearchTerm(term) {
    try {
        if (!term || term.length < 3) return undefined;
        return new RegExp(term, 'i');
    } catch {
        return undefined;
    }
}

function sanitizeVersionToFloat(versionString) {
    return Number.parseFloat(versionString.replaceAll('saas-', ''));
}

function sanitizeVersionToInteger(versionString) {
    return Number.parseInt(versionString.replaceAll('saas-', ''));
}

function getVersionID(version) {
    return `side-version-${version.replaceAll('.', '_')}`;
}

function stringToHTML(str) {
    const template = document.createElement('template');
    template.innerHTML = str.trim();
    return template.content.firstChild;
}

async function loadDifference() {
    // Testing purpose, local file provided by the private checker repository
    const source = window.location.hostname === 'localhost' ? './glowing-modules-diff_sample.json' : gistSource;

    try {
        const response = await fetch(source);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return JSON.parse(await response.text());
    } catch (error) {
        console.error('There was a problem with the fetch operation:', error);
    }
}
