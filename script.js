document.addEventListener('DOMContentLoaded', () => {
    // === 状態管理 ===
    let state = {
        items: [], // 盤面上のアイテムデータ
        wires: [], // 配線データ
        templates: [], // テンプレートデータ
        selectedPorts: [], // 現在選択中のポートIDの配列
        selectedItemId: null, // 現在選択中のアイテムID
        nextId: { item: 0, wire: 0, template: 0 }, // 次に割り当てるIDのカウンター
        isTemplateMode: false, // モーダルがテンプレート編集モードかどうかのフラグ
    };
    let history = []; // 履歴スタック (Undo用)
    let redoStack = []; // Redoスタック (Redo用)

    // === ドラッグ＆クリック判定用変数 ===
    let dragTarget = null; // ドラッグ中のDOM要素
    let isDragging = false; // ドラッグが有効になったかどうかのフラグ
    let dragStartTimer = null; // 長押し判定のためのタイマーID
    let offset = { x: 0, y: 0 }; // ドラッグ開始時のマウス位置と要素のオフセット

    // === DOM要素の取得 ===
    const wiringBoard = document.getElementById('wiring-board');
    const tabNav = document.getElementById('tab-nav');
    const modal = document.getElementById('item-modal');
    const form = document.getElementById('item-form');
    
    // ボタン類
    const addItemBtn = document.getElementById('add-item-btn');
    const deleteItemBtn = document.getElementById('delete-item-btn');
    const wireBtn = document.getElementById('wire-btn');
    const organizeBtn = document.getElementById('organize-btn');
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    const addTemplateBtn = document.getElementById('add-template-btn');
    const resetBoardBtn = document.getElementById('reset-board-btn');
    const cancelItemBtn = document.getElementById('cancel-item-btn');

    // === 履歴管理関数 ===
    const saveStateToHistory = () => {
        history.push(JSON.parse(JSON.stringify({ items: state.items, wires: state.wires })));
        redoStack = [];
        updateHistoryButtons();
    };

    const undo = () => {
        if (history.length > 1) {
            redoStack.push(history.pop());
            const previousState = history[history.length - 1];
            state.items = JSON.parse(JSON.stringify(previousState.items));
            state.wires = JSON.parse(JSON.stringify(previousState.wires));
            state.selectedPorts = [];
            state.selectedItemId = null;
            renderAll();
            updateHistoryButtons();
        }
    };

    const redo = () => {
        if (redoStack.length > 0) {
            const nextState = redoStack.pop();
            history.push(nextState);
            state.items = JSON.parse(JSON.stringify(nextState.items));
            state.wires = JSON.parse(JSON.stringify(nextState.wires));
            state.selectedPorts = [];
            state.selectedItemId = null;
            renderAll();
            updateHistoryButtons();
        }
    };

    const updateHistoryButtons = () => {
        undoBtn.disabled = history.length <= 1;
        redoBtn.disabled = redoStack.length === 0;
    };

    // === 描画関数 ===
    function renderAll() {
        renderItems();
        renderWires();
        saveStateToLocalStorage();
        updateDeleteButtonState();
        
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab) {
            const tabId = activeTab.dataset.tab;
            if (tabId === 'tab-bom') updateBom();
            if (tabId === 'tab-board-info') updateBoardInfo();
        }
    }

    function renderItems() {
        const existingItemContainers = wiringBoard.querySelectorAll('.item-container');
        existingItemContainers.forEach(el => el.remove());

        state.items.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = 'item-container';
            itemEl.id = item.id;
            if (item.id === state.selectedItemId) itemEl.classList.add('selected');
            itemEl.style.left = `${item.x}px`;
            itemEl.style.top = `${item.y}px`;
            itemEl.style.backgroundColor = item.color;
            itemEl.dataset.itemId = item.id;

            const nameEl = document.createElement('div');
            nameEl.className = 'item-name';
            nameEl.textContent = `${item.name} [${item.type}]`;
            itemEl.appendChild(nameEl);

            const portsContainer = document.createElement('div');
            portsContainer.className = 'ports-container';
            item.ports.forEach(port => {
                const portEl = document.createElement('div');
                portEl.className = 'port';
                portEl.id = port.id;
                portEl.textContent = port.connector.type;
                if (state.selectedPorts.includes(port.id)) portEl.classList.add('selected');
                portEl.dataset.portId = port.id;
                portsContainer.appendChild(portEl);
            });
            itemEl.appendChild(portsContainer);
            wiringBoard.appendChild(itemEl);
        });

        let svgEl = document.getElementById('wiring-svg');
        if (!svgEl) {
            svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svgEl.id = 'wiring-svg';
            svgEl.style.position = 'absolute'; svgEl.style.top = '0'; svgEl.style.left = '0';
            svgEl.style.width = '200%';
            svgEl.style.height = '200%';
            svgEl.style.pointerEvents = 'none';
            svgEl.style.zIndex = '0';
            wiringBoard.appendChild(svgEl);
        }
    }

    function renderWires() {
        const svg = document.getElementById('wiring-svg');
        if (!svg) return;
        
        while (svg.firstChild) {
            svg.removeChild(svg.firstChild);
        }

        state.wires.forEach(wire => {
            const fromPortEl = document.getElementById(wire.from);
            const toPortEl = document.getElementById(wire.to);
            
            if (!fromPortEl || !toPortEl) {
                console.warn(`配線に必要なポート要素が見つかりません: From=${wire.from}, To=${wire.to}`);
                return;
            }

            const fromRect = fromPortEl.getBoundingClientRect();
            const toRect = toPortEl.getBoundingClientRect();
            const boardRect = wiringBoard.getBoundingClientRect();

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', fromRect.left + fromRect.width / 2 - boardRect.left + wiringBoard.scrollLeft);
            line.setAttribute('y1', fromRect.top + fromRect.height / 2 - boardRect.top + wiringBoard.scrollTop);
            line.setAttribute('x2', toRect.left + toRect.width / 2 - boardRect.left + wiringBoard.scrollLeft);
            line.setAttribute('y2', toRect.top + toRect.height / 2 - boardRect.top + wiringBoard.scrollTop);
            line.className = 'wire-line';
            svg.appendChild(line);
        });
    }

    // === アイテム/ポート選択ロジック ===
    const selectItem = (itemId) => {
        state.selectedItemId = itemId;
        state.selectedPorts = [];
        renderAll();
    };

    const selectPort = (portId) => {
        state.selectedItemId = null;
        const index = state.selectedPorts.indexOf(portId);
        if (index > -1) {
            state.selectedPorts.splice(index, 1);
        } else {
            state.selectedPorts.push(portId);
        }
        renderAll();
    };

    const deleteSelectedItem = () => {
        if (!state.selectedItemId) return;
        
        const portIdsToDelete = state.items.find(i => i.id === state.selectedItemId)?.ports.map(p => p.id) || [];
        
        state.items = state.items.filter(i => i.id !== state.selectedItemId);
        state.wires = state.wires.filter(w => !portIdsToDelete.includes(w.from) && !portIdsToDelete.includes(w.to));
        
        state.selectedItemId = null;
        state.selectedPorts = [];
        saveStateToHistory();
        renderAll();
    };

    const updateDeleteButtonState = () => {
        deleteItemBtn.disabled = state.selectedItemId === null;
    };

    const organizeItems = () => {
        const layers = {};
        state.items.forEach(i => {
            const l = i.layer;
            if (!layers[l]) layers[l] = [];
            layers[l].push(i);
        });

        const sortedLayers = Object.keys(layers).sort((a,b)=>a-b);
        
        const layerXSpacing = 300;
        const itemYSpacing = 200;

        sortedLayers.forEach((layer, i) => {
            layers[layer].forEach((item, j) => {
                item.x = 50 + i * layerXSpacing;
                item.y = 50 + j * itemYSpacing;
            });
        });
        saveStateToHistory();
        renderAll();
    };
    
    const resetBoard = () => {
        if (confirm('盤面上のすべてのアイテムと配線を削除します。よろしいですか？')) {
            state.items = [];
            state.wires = [];
            state.selectedItemId = null;
            state.selectedPorts = [];
            saveStateToHistory();
            renderAll();
        }
    };

    // === アイテム/テンプレート追加・編集モーダル関連関数 ===
    function openModal(isTemplateMode = false, itemToEdit = null) {
        form.reset();
        document.getElementById('edit-item-id').value = '';
        document.getElementById('ports-config').innerHTML = '';
        state.isTemplateMode = isTemplateMode;
        
        document.getElementById('item-port-count').value = itemToEdit ? itemToEdit.ports.length : 1;

        if (itemToEdit) {
            document.getElementById('modal-title').textContent = isTemplateMode ? 'テンプレートを編集' : '項目を編集';
            document.getElementById('edit-item-id').value = itemToEdit.id;
            const itemTypeRadio = document.querySelector(`input[name="item-type"][value="${itemToEdit.type}"]`);
            if (itemTypeRadio) {
                itemTypeRadio.checked = true;
            } else {
                document.querySelector('input[name="item-type"]').checked = true;
            }
            document.getElementById('item-name').value = itemToEdit.name;
            document.getElementById('item-layer').value = itemToEdit.layer;
            document.getElementById('item-color').value = itemToEdit.color;
            updatePortsConfig(itemToEdit.ports);
        } else {
            document.getElementById('modal-title').textContent = isTemplateMode ? 'テンプレート登録' : '項目を追加';
            document.querySelector('input[name="item-type"]').checked = true;

            const templateSelection = document.getElementById('template-selection');
            if (!isTemplateMode && state.templates.length > 0) {
                templateSelection.style.display = 'block';
                renderTemplateSelectionList();
            } else {
                templateSelection.style.display = 'none';
            }
            updatePortsConfig();
        }
        modal.style.display = 'flex';
    }

    const updatePortsConfig = (ports = []) => {
        const count = parseInt(document.getElementById('item-port-count').value) || 0;
        const container = document.getElementById('ports-config');
        container.innerHTML = count > 0 ? '<h4>各ポートの設定</h4>' : '';
        for (let i = 0; i < count; i++) {
            const type = ports[i]?.connector.type || '';
            const pins = ports[i]?.connector.pins || '';
            container.innerHTML += `<div class="port-setting">
                <input type="text" value="${type}" placeholder="ポート${i + 1} 名" required>
                <input type="number" value="${pins}" placeholder="極数" min="1" required>
            </div>`;
        }
    };
    
    function handleFormSubmit(e) {
        e.preventDefault();

        const editingId = document.getElementById('edit-item-id').value;
        const selectedTypeElement = document.querySelector('input[name="item-type"]:checked');
        
        if (!selectedTypeElement) {
            alert('項目タイプを選択してください。');
            return;
        }

        const initialX = 100 + Math.random() * 100;
        const initialY = 100 + Math.random() * 100;

        const itemData = {
            id: editingId || `i${state.nextId.item++}`,
            type: selectedTypeElement.value,
            name: document.getElementById('item-name').value,
            layer: parseInt(document.getElementById('item-layer').value) || 1,
            ports: [],
            color: document.getElementById('item-color').value,
            x: initialX, 
            y: initialY,
        };

        const portSettings = document.getElementById('ports-config').querySelectorAll('.port-setting');
        portSettings.forEach((ps, i) => {
            itemData.ports.push({
                id: `${itemData.id}-p${i}-${Date.now() + i}`, 
                connector: { type: ps.children[0].value, pins: parseInt(ps.children[1].value) || 1 }
            });
        });

        if (state.isTemplateMode) {
            const index = state.templates.findIndex(t => t.id === editingId);
            if (index > -1) {
                state.templates[index] = itemData;
            } else {
                itemData.id = `t${state.nextId.template++}`;
                state.templates.push(itemData);
            }
            renderTemplatesTab();
        } else {
            state.items.push(itemData);
            saveStateToHistory();
            renderAll();
        }
        modal.style.display = 'none';
    }

    // === テンプレートタブ関連関数 ===
    function renderTemplatesTab() {
        const listEl = document.getElementById('template-list');
        listEl.innerHTML = '';
        if(state.templates.length === 0){
            listEl.innerHTML = '<p>テンプレートがありません。「テンプレート登録」ボタンで追加してください。</p>';
            return;
        }
        state.templates.forEach(template => {
            const item = document.createElement('div');
            item.className = 'template-item';
            item.innerHTML = `<div><p><strong>${template.name} [${template.type}]</strong></p><p><small>ポート数: ${template.ports.length}</small></p></div><div class="template-buttons"><button class="edit-template-btn" data-template-id="${template.id}">編集</button><button class="use-template-btn" data-template-id="${template.id}">使用</button></div>`;
            
            item.querySelector('.use-template-btn').addEventListener('click', () => createItemFromTemplate(template));
            item.querySelector('.edit-template-btn').addEventListener('click', () => openModal(true, template));
            
            listEl.appendChild(item);
        });
    }

    function renderTemplateSelectionList() {
        const listEl = document.getElementById('template-selection-list');
        listEl.innerHTML = '';
        state.templates.forEach(template => {
            const button = document.createElement('button');
            button.textContent = `${template.name} [${template.type}]`;
            button.addEventListener('click', e => {
                e.preventDefault();
                createItemFromTemplate(template);
                modal.style.display = 'none';
            });
            listEl.appendChild(button);
        });
    }
    
    function createItemFromTemplate(template) {
        const newItem = JSON.parse(JSON.stringify(template));
        newItem.id = `i${state.nextId.item++}`;
        newItem.ports.forEach((p, i) => {
            p.id = `${newItem.id}-p${i}-${Date.now() + i}`; 
        });
        newItem.x = 100 + Math.random() * 100; 
        newItem.y = 100 + Math.random() * 100;
        state.items.push(newItem);
        saveStateToHistory();
        renderAll();
    }
    
    // === BOM（部品表）タブ関連関数 ===
    const updateBom = () => {
        const el = document.getElementById('bom-list');
        el.innerHTML = '';
        if (state.items.length === 0) {
            el.innerHTML = '<p>盤面に項目を追加すると、ここに部品表が表示されます。</p>';
            return;
        }
        const counts = {};
        state.items.forEach(i => {
            const k = `${i.name} [${i.type}]`;
            counts[k] = (counts[k] || 0) + 1;
        });
        for (const name in counts) {
            el.innerHTML += `<div class="list-item"><p><strong>${name}:</strong> ${counts[name]}個</p></div>`;
        }
    };
    
    const updateBoardInfo = () => {
        const el = document.getElementById('tab-board-info');
        el.innerHTML = '';
        el.innerHTML += `<div class="list-item"><p><strong>総アイテム数:</strong> ${state.items.length}個</p></div>`;
        el.innerHTML += `<div class="list-item"><p><strong>総配線数:</strong> ${state.wires.length}本</p></div>`;
    };


    // === データ永続化 (LocalStorage) 関数 ===
    const saveStateToLocalStorage = () => localStorage.setItem('wiringAppData', JSON.stringify(state));

    function loadStateFromLocalStorage() {
        const saved = localStorage.getItem('wiringAppData');
        if (saved) {
            const loaded = JSON.parse(saved);
            state.items = loaded.items || [];
            state.items.forEach(item => { item.type = item.type || '基板'; });
            state.wires = loaded.wires || [];
            state.templates = loaded.templates || [];
            
            const maxItemId = state.items.reduce((max, item) => {
                const idNum = parseInt(item.id.replace('i', '')) || 0;
                return Math.max(max, idNum);
            }, -1);
            const maxWireId = state.wires.reduce((max, wire) => {
                const idNum = parseInt(wire.id.replace('w', '')) || 0;
                return Math.max(max, idNum);
            }, -1);
            const maxTemplateId = state.templates.reduce((max, t) => {
                const idNum = parseInt(t.id.replace('t', '')) || 0;
                return Math.max(max, idNum);
            }, -1);

            state.nextId = {
                item: maxItemId + 1,
                wire: maxWireId + 1,
                template: maxTemplateId + 1,
            };
        }
    }

    // === 初期化処理 ===
    function initialize() {
        loadStateFromLocalStorage();
        
        history = [JSON.parse(JSON.stringify({ items: state.items, wires: state.wires }))];
        redoStack = [];
        updateHistoryButtons();

        tabNav.addEventListener('click', e => {
            if (e.target.classList.contains('tab-btn')) {
                const tabId = e.target.dataset.tab;
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tabNav.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.getElementById(tabId).classList.add('active');
                e.target.classList.add('active');
                
                if (tabId === 'tab-bom') updateBom();
                if (tabId === 'tab-templates') renderTemplatesTab();
                if (tabId === 'tab-board-info') updateBoardInfo();
            }
        });
        
        wiringBoard.addEventListener('mousedown', e => {
            const targetItemEl = e.target.closest('.item-container');
            if (targetItemEl) {
                dragStartTimer = setTimeout(() => {
                    isDragging = true;
                    dragTarget = targetItemEl;
                    const item = state.items.find(i => i.id === dragTarget.dataset.itemId);
                    if (!item) return;
                    
                    // ★★★バグ修正★★★: ドラッグ開始時のオフセット計算を修正
                    const boardRect = wiringBoard.getBoundingClientRect();
                    const mouseXInBoard = e.clientX - boardRect.left + wiringBoard.scrollLeft;
                    const mouseYInBoard = e.clientY - boardRect.top + wiringBoard.scrollTop;
                    offset = { x: mouseXInBoard - item.x, y: mouseYInBoard - item.y };
                    
                    dragTarget.style.cursor = 'grabbing';
                    dragTarget.style.zIndex = 10;
                }, 150);
            }
        });

        document.addEventListener('mousemove', e => {
            if (isDragging && dragTarget) {
                const item = state.items.find(i => i.id === dragTarget.dataset.itemId);
                if (!item) return;

                // ★★★バグ修正★★★: ドラッグ中の座標計算を修正
                const boardRect = wiringBoard.getBoundingClientRect();
                const newMouseXInBoard = e.clientX - boardRect.left + wiringBoard.scrollLeft;
                const newMouseYInBoard = e.clientY - boardRect.top + wiringBoard.scrollTop;
                
                item.x = newMouseXInBoard - offset.x;
                item.y = newMouseYInBoard - offset.y;

                dragTarget.style.left = `${item.x}px`;
                dragTarget.style.top = `${item.y}px`;
                renderWires();
            }
        });

        document.addEventListener('mouseup', () => {
            clearTimeout(dragStartTimer);
            if (isDragging && dragTarget) {
                dragTarget.style.cursor = 'grab';
                dragTarget.style.zIndex = 1;
                saveStateToHistory();
            }
            isDragging = false;
            dragTarget = null;
        });

        wiringBoard.addEventListener('click', e => {
            if (isDragging) {
                return; 
            }

            const targetPort = e.target.closest('.port');
            const targetItem = e.target.closest('.item-container');

            if (targetPort) {
                e.stopPropagation();
                selectPort(targetPort.dataset.portId);
            } else if (targetItem) {
                e.stopPropagation();
                selectItem(targetItem.dataset.itemId);
            } else {
                state.selectedItemId = null;
                state.selectedPorts = [];
                renderAll();
            }
        });
        
        // --- 各種ボタンイベント ---
        addItemBtn.addEventListener('click', () => openModal(false));
        deleteItemBtn.addEventListener('click', deleteSelectedItem);
        wireBtn.addEventListener('click', () => {
            if (state.selectedPorts.length < 2) {
                alert('配線するにはポートを2つ選択してください。');
                return;
            }
            for (let i = 0; i < state.selectedPorts.length - 1; i += 2) {
                state.wires.push({ id: `w${state.nextId.wire++}`, from: state.selectedPorts[i], to: state.selectedPorts[i + 1] });
            }
            state.selectedPorts = [];
            saveStateToHistory();
            renderAll();
        });
        organizeBtn.addEventListener('click', organizeItems);
        undoBtn.addEventListener('click', undo);
        redoBtn.addEventListener('click', redo);
        addTemplateBtn.addEventListener('click', () => openModal(true));
        resetBoardBtn.addEventListener('click', resetBoard);
        
        form.addEventListener('submit', handleFormSubmit);
        cancelItemBtn.addEventListener('click', () => modal.style.display = 'none');
        document.getElementById('item-port-count').addEventListener('input', () => updatePortsConfig());

        renderAll();
    }
    
    initialize();
});