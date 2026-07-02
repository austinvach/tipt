export interface Movie {
  id: string;
  title: string;
  year: number;
  duration: number;
  description: string;
  thumbnail: string;
  bitcoin: number;
  videoUrl: string;
}

export const MOVIES: Movie[] = [
  {
    id: "maltese-falcon",
    title: "The Maltese Falcon",
    year: 1941,
    duration: 6033,
    bitcoin: 100,
    description:
      "A private detective takes on a case that involves him with three eccentric criminals, a beautiful liar, and their common quest for a priceless statuette.",
    thumbnail:
      "https://upload.wikimedia.org/wikipedia/commons/6/6b/The_Maltese_Falcon_%281941_film_poster%29.jpg",
    videoUrl:
      "https://archive.org/download/the-maltese-falcon-1941-1080p-blu-ray/The%20Maltese%20Falcon%20%281941%29%20%281080p%20BluRay%20.mp4",
  },
  {
    id: "shadow-of-a-doubt",
    title: "Shadow of a Doubt",
    year: 1943,
    duration: 6120,
    bitcoin: 200,
    description:
      "Young Charlie idolizes her visiting Uncle Charlie, not suspecting that he may be the Merry Widow Murderer sought by two detectives.",
    thumbnail:
      "https://upload.wikimedia.org/wikipedia/commons/f/fa/Shadow_of_a_Doubt_%281942_poster_-_Style_C%29.jpg",
    videoUrl:
      "https://archive.org/download/shadow-of-a-doubt-1943/Shadow%20Of%20A%20Doubt%20(1943)/Shadow%20Of%20A%20Doubt%20-%201943.mp4",
  },
  {
    id: "laura",
    title: "Laura",
    year: 1944,
    duration: 5580,
    bitcoin: 300,
    description:
      "A hardboiled detective falls in love with the portrait of a supposedly murdered woman, only for her to turn up alive.",
    thumbnail:
      "https://upload.wikimedia.org/wikipedia/commons/3/30/Laura_%281944_film_poster%29.jpg",
    videoUrl:
      "https://archive.org/download/laura-1944-hd-gene-tierney-dana-andrews-clifton-webb-vincent-price/Laura%20(1944)%20%20%20_HD_%20%20Gene%20Tierney%2C%20Dana%20Andrews%2C%20Clifton%20Webb%2C%20Vincent%20Price.mp4",
  },
];
