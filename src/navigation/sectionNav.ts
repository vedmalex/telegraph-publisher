/**
 * Навигация по длинному ряду однородных разделов.
 *
 * Когда глава состоит из сотен пронумерованных частей — стихов, сутр, мантр,
 * пунктов — читателю виден только первый из них, а до двадцатого нужно листать.
 * Перечислять их все в оглавлении бессмысленно: список окажется длиннее самой
 * главы и похоронит под собой соседние главы. Вместо этого в начале главы
 * ставится короткая строка переходов — «К тексту: 1 · 20 · 40 · 60».
 *
 * Модуль ничего не знает ни о стихах, ни о EPUB: он получает заголовки и
 * отдаёт узлы. Отсюда он годится и для другой вёрстки того же рода.
 */

import { AnchorGenerator, type HeadingInfo } from "../utils/AnchorGenerator";
import type { TelegraphNode } from "../telegraphPublisher";

/** Один переход в строке навигации. */
export interface SectionNavItem {
	/** Что видит читатель: «20», «2.1.20». */
	label: string;
	/** Якорь раздела, к которому ведёт переход. */
	anchor: string;
	/** Порядковый номер раздела в главе, начиная с 1. */
	ordinal: number;
}

export interface SectionNavOptions {
	/** Со скольких разделов строка появляется. */
	threshold?: number;
	/** Сколько переходов в строке допустимо. */
	maxItems?: number;
	/** Лестница шагов; берётся первый, который укладывается в maxItems. */
	steps?: number[];
	/** Уровень заголовков, образующих ряд; "auto" — самый частый уровень. */
	matchLevel?: number | "auto";
	/** Дополнительный отбор заголовков ряда. */
	matchPattern?: RegExp;
	/** ASCII-якоря (транслитерация) — для EPUB, где сырой кириллический
	 * фрагмент URI читалкой не разрешается. */
	asciiAnchors?: boolean;
}

const DEFAULTS = {
	threshold: 30,
	maxItems: 12,
	// Читатель думает круглыми числами: он хочет «к двадцатому», а не «к
	// тринадцатому». Шаг, посчитанный как count/maxItems, дал бы вехи 13, 25, 37 —
	// формально равномерно и бесполезно на практике.
	steps: [10, 20, 50, 100, 200],
};

/** Минимум переходов, ниже которого строка не окупает своего места. */
const MIN_ITEMS = 3;

/**
 * Выбрать порядковые номера разделов, к которым ведут переходы.
 *
 * Всегда включает первый раздел: он служит и точкой возврата к началу главы.
 */
export function selectMilestones(count: number, options: SectionNavOptions = {}): number[] {
	const threshold = options.threshold ?? DEFAULTS.threshold;
	const maxItems = options.maxItems ?? DEFAULTS.maxItems;
	const steps = options.steps ?? DEFAULTS.steps;

	if (count < threshold) return [];

	const build = (step: number): number[] => {
		const result = [1];
		for (let ordinal = step; ordinal <= count; ordinal += step) {
			if (ordinal !== 1) result.push(ordinal);
		}
		return result;
	};

	// Шаг подбирается по фактической длине строки, а не по оценке: последняя
	// веха попадает в строку, только если не выходит за пределы главы, и на
	// круглых величинах ошибка на единицу решает, влезет строка или нет.
	const step = steps.find(candidate => build(candidate).length <= maxItems)
		?? steps[steps.length - 1]!;

	const milestones = build(step);
	return milestones.length >= MIN_ITEMS ? milestones : [];
}

/**
 * Отобрать заголовки, образующие однородный ряд.
 *
 * Уровень определяется по самому многочисленному: так ряд находится сам, без
 * знания слова «Текст» — в упанишадах это «Мантра», в сутрах «Сутра».
 */
function selectRow(headings: HeadingInfo[], options: SectionNavOptions): HeadingInfo[] {
	const byLevel = new Map<number, number>();
	for (const heading of headings) {
		byLevel.set(heading.level, (byLevel.get(heading.level) ?? 0) + 1);
	}
	if (byLevel.size === 0) return [];

	const level = options.matchLevel === undefined || options.matchLevel === "auto"
		? [...byLevel.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0]
		: options.matchLevel;

	return headings.filter(heading =>
		heading.level === level &&
		(!options.matchPattern || options.matchPattern.test(heading.textForAnchor)));
}

/**
 * Отбросить общий для всего ряда префикс, оставив различающую часть.
 *
 * «Текст 2.1.20» среди себе подобных сокращается до «2.1.20»: слово «Текст»
 * повторяется в каждом переходе и только занимает место.
 */
function stripCommonPrefix(labels: string[]): string[] {
	if (labels.length < 2) return labels;

	let prefix = labels[0]!;
	for (const label of labels.slice(1)) {
		while (prefix && !label.startsWith(prefix)) {
			prefix = prefix.slice(0, -1);
		}
		if (!prefix) break;
	}
	// Режем по границе слова, иначе «Текст 1» и «Текст 10» дали бы префикс
	// «Текст 1» и метку «0».
	const cut = prefix.replace(/[^\s.:—-]*$/, "");
	if (!cut.trim()) return labels;

	const stripped = labels.map(label => label.slice(cut.length).trim());
	return stripped.every(label => label) ? stripped : labels;
}

/** Последнее число в заголовке — номер раздела, как его видит читатель. */
function readNumber(heading: HeadingInfo): number | null {
	const matches = heading.textForAnchor.match(/\d+/g);
	if (!matches) return null;
	const value = Number.parseInt(matches[matches.length - 1]!, 10);
	return Number.isFinite(value) ? value : null;
}

/**
 * Разложить ряд по видимым номерам разделов, если они образуют возрастающий ряд.
 *
 * Порядковое место в главе и написанный номер расходятся: перед стихами стоит
 * мангалачарана, номера пропускают значения, встречаются объединённые «20–22».
 * Читатель же просит «к двадцатому» по номеру, который видит, поэтому вехи
 * ставятся по номерам, а к порядковому счёту мы возвращаемся лишь тогда, когда
 * номеров нет или они не выстраиваются по возрастанию.
 */
function numbering(row: HeadingInfo[]): number[] | null {
	const numbers = row.map(readNumber);
	const known = numbers.filter((value): value is number => value !== null);
	if (known.length < row.length * 0.9) return null;
	return numbers.map(value => value ?? 0);
}

/**
 * Построить переходы для главы. Возвращает null, если строка не нужна.
 */
export function buildSectionNav(
	headings: HeadingInfo[],
	options: SectionNavOptions = {},
): SectionNavItem[] | null {
	const row = selectRow(headings, options);
	if (row.length < (options.threshold ?? DEFAULTS.threshold)) return null;

	const numbers = numbering(row);
	// Шаг берётся от последнего номера главы, а не от числа заголовков: при
	// пропусках в нумерации иначе вехи не дотянулись бы до конца.
	const span = numbers ? Math.max(...numbers) : row.length;
	const milestones = selectMilestones(span, { ...options, threshold: 1 });
	if (milestones.length === 0) return null;

	const picked = new Set<number>();
	for (const target of milestones) {
		// Индекс раздела, чей номер первым достигает вехи. Вставные стихи
		// нарушают возрастание, поэтому ищем по всему ряду, а не бинарно, и
		// затем возвращаем найденное в порядок документа.
		const index = numbers
			? numbers.findIndex(value => value >= target)
			: target - 1;
		if (index >= 0 && index < row.length) picked.add(index);
	}

	const indices = [...picked].sort((a, b) => a - b);
	if (indices.length < 3) return null;
	const chosen = indices.map(index => row[index]!);
	const labels = stripCommonPrefix(chosen.map(heading => heading.textForAnchor.trim()));

	return chosen.map((heading, index) => ({
		label: labels[index] ?? String(index + 1),
		// Якорь берётся тем же генератором, что расставляет id на заголовках, —
		// иначе переход указал бы в пустоту.
		anchor: options.asciiAnchors
			? AnchorGenerator.generateAsciiAnchor(heading)
			: AnchorGenerator.generateAnchor(heading),
		ordinal: indices[index]! + 1,
	}));
}

/**
 * Отрисовать строку переходов.
 *
 * Разделитель — не ссылка, промахнуться по нему нельзя. Отступы вокруг цифр
 * задаются стилем: на телефоне и на электронных чернилах по одиночной цифре
 * иначе не попасть.
 */
export function renderSectionNavNodes(
	items: SectionNavItem[],
	caption: string,
	variant: "start" | "end" = "start",
): TelegraphNode[] {
	if (items.length === 0) return [];

	const children: (string | TelegraphNode)[] = [];
	if (caption) children.push({ tag: "strong", children: [caption] }, " ");

	items.forEach((item, index) => {
		if (index > 0) children.push(" · ");
		children.push({ tag: "a", attrs: { href: `#${item.anchor}` }, children: [item.label] });
	});

	return [{
		tag: "p",
		attrs: { class: variant === "end" ? "section-nav section-nav-end" : "section-nav" },
		children,
	}];
}
