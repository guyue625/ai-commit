/** Editable suggestions: opening always lists all models; only new typing filters. */
export class ModelPicker {
  private query = '';
  private activeIndex = -1;

  constructor(
    private readonly root: HTMLElement,
    private readonly getModels: () => string[],
    private readonly isBusy: () => boolean
  ) {
    root.addEventListener('focusin', (event) => {
      if (event.target === this.input && !this.isBusy()) {
        this.open();
      }
    });
    root.addEventListener('focusout', (event) => {
      if (!(event.relatedTarget instanceof Node) || !this.container?.contains(event.relatedTarget)) {
        this.close();
      }
    });
    document.addEventListener('pointerdown', (event) => {
      if (!(event.target instanceof Node) || !this.container?.contains(event.target)) {
        this.close();
      }
    });
    root.addEventListener('pointerdown', (event) => {
      if (event.target instanceof Element && event.target.closest('[data-model-index], [data-action="toggle-models"]')) {
        // Keep input focus until the click selects an option or toggles the list.
        event.preventDefault();
      }
    });
    root.addEventListener('click', (event) => {
      if (!(event.target instanceof Element) || this.isBusy()) { return; }
      const option = event.target.closest<HTMLElement>('[data-model-index]');
      if (option) {
        this.select(Number(option.dataset.modelIndex));
      } else if (event.target.closest('[data-action="toggle-models"]')) {
        if (this.isOpen) { this.close(); }
        else { this.input?.focus(); this.open(); }
      } else if (event.target === this.input && !this.isOpen) {
        this.open();
      }
    });
    root.addEventListener('input', (event) => {
      if (event.target !== this.input || this.isBusy()) { return; }
      this.query = this.input?.value ?? '';
      this.activeIndex = -1;
      this.showOptions();
    });
    root.addEventListener('keydown', (event) => {
      if (event.target !== this.input || this.isBusy() || event.isComposing) { return; }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!this.isOpen) { this.open(); }
        const count = this.filteredModels.length;
        if (!count) { return; }
        this.activeIndex = event.key === 'ArrowDown'
          ? (this.activeIndex + 1) % count
          : (this.activeIndex <= 0 ? count - 1 : this.activeIndex - 1);
        this.showOptions();
        this.list?.children[this.activeIndex]?.scrollIntoView({ block: 'nearest' });
      } else if (event.key === 'Enter' && this.isOpen && this.activeIndex >= 0) {
        event.preventDefault();
        this.select(this.activeIndex);
      } else if (event.key === 'Escape' && this.isOpen) {
        event.preventDefault();
        this.close();
      }
    });
  }

  modelsLoaded(): void {
    const focused = document.activeElement;
    if (focused === this.input ||
      (focused instanceof Element && focused.matches('[data-action="fetch-models"]'))) {
      this.input?.focus();
      this.open();
    }
  }

  private open(): void {
    if (this.isBusy()) { return; }
    this.query = '';
    this.activeIndex = -1;
    this.showOptions();
  }

  private get container(): HTMLElement | null {
    return this.root.querySelector('.model-picker');
  }

  private get input(): HTMLInputElement | null {
    return this.root.querySelector('input[name="model"]');
  }

  private get list(): HTMLElement | null {
    return this.root.querySelector('#model-options');
  }

  private get isOpen(): boolean {
    return this.list?.hidden === false;
  }

  private get filteredModels(): string[] {
    const query = this.query.trim().toLocaleLowerCase();
    return this.getModels().filter(model => model.toLocaleLowerCase().includes(query));
  }

  private close(): void {
    if (this.list) { this.list.hidden = true; }
    this.input?.setAttribute('aria-expanded', 'false');
    this.input?.removeAttribute('aria-activedescendant');
    this.container?.querySelector('button')?.setAttribute('aria-expanded', 'false');
    this.activeIndex = -1;
    this.query = '';
  }

  private select(index: number): void {
    const model = this.filteredModels[index];
    const input = this.input;
    if (model === undefined || !input) { return; }
    input.value = model;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
    this.close();
  }

  private showOptions(): void {
    const list = this.list;
    const input = this.input;
    if (!list || !input) { return; }
    const models = this.filteredModels;
    list.replaceChildren(...models.map((model, index) => {
      const option = document.createElement('div');
      option.id = `model-option-${index}`;
      option.className = `model-picker__option${index === this.activeIndex ? ' is-highlighted' : ''}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(model === input.value));
      option.dataset.modelIndex = String(index);
      option.textContent = model;
      option.title = model;
      return option;
    }));
    if (models.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'model-picker__empty';
      empty.setAttribute('role', 'status');
      empty.textContent = this.getModels().length ? list.dataset.noMatches ?? '' : list.dataset.empty ?? '';
      list.append(empty);
    }
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    this.container?.querySelector('button')?.setAttribute('aria-expanded', 'true');
    if (this.activeIndex >= 0 && models[this.activeIndex] !== undefined) {
      input.setAttribute('aria-activedescendant', `model-option-${this.activeIndex}`);
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }
}
