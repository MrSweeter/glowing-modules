const gistSource =
    'https://gist.githubusercontent.com/GaetanVandenBergh/35a02a7148d9919a9aea76796d824d63/raw/glowing-modules-diff.json';

let compareMode = false;
let history = {};

async function onDOMContentLoaded() {
    document.getElementById('copyright-year').innerText = new Date().getFullYear();
    document.getElementById('footer-data-source').href = gistSource.slice(
        0,
        gistSource.lastIndexOf('/', gistSource.lastIndexOf('/') - 1)
    );

    const diff = await loadDifference();
    history = generateModuleHistory(diff);
    loadVersionsMenu(diff);
    loadModeSwitch(diff);

    if (window.location.search.includes('compare')) {
        const modeSwitchElement = document.getElementById('mode-switch');
        modeSwitchElement.click();
    }

    handleSearch();
}

document.removeEventListener('DOMContentLoaded', onDOMContentLoaded);
document.addEventListener('DOMContentLoaded', onDOMContentLoaded);

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/difference
Array.prototype.gm_difference = function (iterable) {
    let difference = Array.from(this);
    for (let elem of iterable) {
        difference = difference.filter((e) => e != elem);
    }
    return difference;
};

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
        const stable = sanitizeVersionToFloat(version) == sanitizeVersionToInteger(version);
        const versionMenuItem = stringToHTML(`
            <a
                id=${getVersionID(version)}
                style="cursor: pointer"
                class="side-version-item list-group-item list-group-item-action py-2 ripple ${
                    stable ? '' : 'ps-5'
                }"
            >
                <i class="fas fa-${
                    stable ? 'code-branch' : 'code-branch'
                } fa-fw me-3 opacity-50"></i><span>${version}</span>
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
    const fromSelectorToggleElement = document.getElementById('version-select-from-toggle');

    toSelectorToggleElement.onclick = () => {
        versionSelectorElement.dataset.mode = 'to';
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
    updateVersionToggle(fromSelectorToggleElement, previous);
}

function onVersionSelected(version, diff) {
    const selectorElement = document.getElementById('version-selector');
    const mode = selectorElement.dataset.mode;
    const toggleElement = document.getElementById(`version-select-${mode}-toggle`);
    updateVersionToggle(toggleElement, version);

    toggleOverlay(false);
    onComparatorChange(diff);
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

function compareVersion(diff, toValue, fromValue = undefined) {
    const added = {};
    const removed = {};

    // from lower to upper
    const versions = Object.keys(diff).sort(
        (a, b) => sanitizeVersionToFloat(a) - sanitizeVersionToFloat(b)
    );

    let indexOfTo = versions.indexOf(toValue);
    fromValue = fromValue ?? versions[indexOfTo - 1];
    let indexOfFrom = versions.indexOf(fromValue);

    for (let i = indexOfFrom + 1; i <= indexOfTo; i++) {
        const version = versions[i];

        const vcontent = diff[version];

        for (const [repo, content] of Object.entries(vcontent)) {
            added[repo] = (added[repo] || [])
                .concat(content['+'] || [])
                .gm_difference(content['-'] || []);
            removed[repo] = (removed[repo] || [])
                .concat(content['-'] || [])
                .gm_difference(content['+'] || []);
        }
    }

    const modulesAddedContentElement = document.getElementById('modules-added-content');
    loadList(modulesAddedContentElement, added, 'success');

    const modulesRemovedContentElement = document.getElementById('modules-removed-content');
    loadList(modulesRemovedContentElement, removed, 'danger');

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

    for (const [repo, content] of Object.entries(repos)) {
        if (content.length) {
            const sectionElement = stringToHTML(`
                <h5 class="mx-2 my-1 w-100"><span class="badge badge-primary w-100">${repo}</span></h5>
            `);
            container.appendChild(sectionElement);

            for (const m of content) {
                const moduleHistory = history[m]?.join('\n');
                const listItem = stringToHTML(`
                    <span class="badge badge-module badge-${style} mx-2 my-1" title="${moduleHistory}">${m}</span>
                `);
                container.appendChild(listItem);
            }
        }
    }
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

function handleSearch() {
    const searchInput = document.getElementById('searchInput');
    searchInput.removeEventListener('input', searchModule);
    searchInput.addEventListener('input', searchModule);

    document.getElementById('clearInput').onclick = () => {
        searchInput.value = '';
        searchModule();
    };
}

function searchModule() {
    const searchInput = document.getElementById('searchInput');
    const regex = sanitizeSearchTerm(searchInput.value);

    const allBadgeModule = Array.from(document.getElementsByClassName('badge-module'));

    for (const element of allBadgeModule) {
        const isVisible = regex?.test(element.innerText) ?? true;
        if (isVisible) element.classList.remove('d-none');
        else element.classList.add('d-none');
    }
}

function sanitizeSearchTerm(term) {
    try {
        if (term.length < 3) return undefined;
        return new RegExp(term);
    } catch {
        return undefined;
    }
}

function sanitizeVersionToFloat(versionString) {
    return parseFloat(versionString.replaceAll('saas-', ''));
}

function sanitizeVersionToInteger(versionString) {
    return parseInt(versionString.replaceAll('saas-', ''));
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
    try {
        const response = await fetch(gistSource);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return JSON.parse(await response.text());
    } catch (error) {
        console.error('There was a problem with the fetch operation:', error);
    }
}
