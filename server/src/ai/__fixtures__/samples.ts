import type { PlanExcerpt } from "@massing/shared";

/**
 * SAMPLE plan text, written for tests in the style of a Delft omgevingsplan. NOT the real rules of
 * any site: the real excerpts go in data/sites/<id>.json at P12.
 */
export const SAMPLE_EXCERPTS: PlanExcerpt[] = [
  {
    title: "SAMPLE omgevingsplan, artikel Wonen (fictitious test text)",
    url: "sample:omgevingsplan-wonen",
    text: [
      "Artikel 12 Wonen",
      "12.1 Bestemmingsomschrijving",
      "De voor 'Wonen' aangewezen gronden zijn bestemd voor wonen, met daarbij behorende tuinen, erven en parkeervoorzieningen.",
      "12.2 Bouwregels",
      "a. hoofdgebouwen worden uitsluitend binnen het bouwvlak gebouwd;",
      "b. de bouwhoogte van een hoofdgebouw bedraagt ten hoogste 13 m;",
      "c. de goothoogte van een hoofdgebouw bedraagt ten hoogste 10,5 m;",
      "d. het bebouwingspercentage van het bouwperceel bedraagt ten hoogste 60%;",
      "e. de afstand van een hoofdgebouw tot de achterste perceelsgrens bedraagt ten minste 5 m;",
      "f. hoofdgebouwen worden met de voorgevel in de naar de weg gekeerde bouwgrens gebouwd;",
      "g. ter plaatse van de aanduiding 'maximum aantal bouwlagen' mag het aantal bouwlagen niet meer bedragen dan aangegeven.",
      "12.3 Parkeren",
      "Bij het bouwen van woningen wordt voorzien in ten minste 1,2 parkeerplaats per woning op eigen terrein.",
    ].join("\n"),
  },
  {
    title: "SAMPLE omgevingsplan, afwijken van de bouwregels (fictitious test text)",
    url: "sample:omgevingsplan-afwijken",
    text: [
      "12.4 Afwijken van de bouwregels",
      "Het bevoegd gezag kan bij een omgevingsvergunning afwijken van lid 12.2 onder b voor een overschrijding van de bouwhoogte met ten hoogste 2 m, mits de stedenbouwkundige kwaliteit niet onevenredig wordt aangetast.",
    ].join("\n"),
  },
];

export const SAMPLE_BRIEF =
  "Starter apartments for young professionals, around 14 homes. Lots of daylight matters more than squeezing in every unit. " +
  "Keep it low towards the neighbours at the back and leave some garden space. A simple form is fine; no courtyard.";
