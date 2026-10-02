/* Настройки сайта. Меняйте значения справа от двоеточия, кавычки не удаляйте. */
window.SETTINGS = {
  brand: "World of Food",
  brandSub: "Новосибирск · 54",
  contactName: "Ирина",
  phone: "+7 (966) 991-96-99",
  phoneRaw: "+79669919699",
  vk: "https://vk.ru/world_of_food_54",
  vkMessage: "https://vk.me/world_of_food_54",
  telegram: "",          // ссылка, например "https://t.me/имя" — пусто = кнопки нет
  max: "",               // ссылка на MAX — пусто = кнопки нет
  siteUrl: "https://worldoffood54.ru", // адрес сайта после публикации (нужен для ссылки на заказ)

  // Сезон оформления: "newyear" — ёлка, снег, гирлянда; "festive" — праздничное без снега; "none" — без декора
  season: "newyear",
  newYearDeadline: "2026-12-27", // последний день приёма новогодних заказов

  hours: "9:00–22:00",
  replyTime: "в течение часа",

  minOrder: 3600,          // минимальный заказ, ₽
  freeDeliveryFrom: 25000, // бесплатная доставка от, ₽
  leadTimeHours: 24,       // обычно заказывают за 24 часа
  holidayLeadDays: 3,      // в праздники — за 3 дня
  holidayPeriods: [["12-20", "01-08"], ["02-20", "02-23"], ["03-04", "03-08"]], // ММ-ДД — ММ-ДД

  zones: [
    { id: "nsk", title: "Новосибирск", note: "По тарифу Яндекс Доставки" },
    { id: "akadem", title: "Академгородок", note: "Дальний район — доставка дороже" },
    { id: "berdsk", title: "Бердск", note: "Дальний район — доставка дороже" },
    { id: "pickup", title: "Самовывоз", note: "Ленинский район, адрес пришлёт Ирина" }
  ],

  // Онлайн-заявка через Яндекс Формы (пошаговая инструкция — «Инструкция_запуск_сайта», часть 1).
  // Вставьте между кавычками ссылку на форму, например: url: "https://forms.yandex.ru/u/67c9047ae010db669234f549/",
  // Пока пусто — вместо формы клиент видит кнопки «Скопировать заказ и открыть ВК» и телефон.
  // Строку fields не меняйте: это «Идентификаторы вопросов», которые нужно задать скрытым полям в форме.
  yandexForm: {
    url: "https://forms.yandex.ru/u/6abe6752493639754f196b9d/",
    height: 900,
    fields: { order: "order", total: "total", id: "order_id", link: "order_link", date: "date", guests: "guests", zone: "zone" }
  },

  metrikaId: null, // номер счётчика Яндекс Метрики, например 98765432

  // Калькулятор «Сколько заказать?»: граммы и число разных позиций на гостя
  calc: [
    { id: "short", title: "до 1 часа", gFrom: 350, gTo: 400, pFrom: 6, pTo: 8 },
    { id: "mid", title: "1,5–2 часа", gFrom: 450, gTo: 550, pFrom: 8, pTo: 10 },
    { id: "long", title: "3–4 часа", gFrom: 600, gTo: 800, pFrom: 12, pTo: 15 }
  ],

  // Наборы на компанию: состав и цену Ирина подбирает под число гостей.
  // menuCat — продублировать набор карточкой в этой категории меню (hot = «Горячее»)
  sets: [
    { id: "salatov", title: "Набор салатов", img: "nabor-salatov", text: "Несколько салатов в одном боксе — классика и хиты новогоднего стола." },
    { id: "goryachego", title: "Набор горячего", img: "nabor-goryachego", menuCat: "hot", text: "Куриные рулеты в беконе, фаршированные шампиньоны, картофель и другое горячее в одном боксе — удобно подать на компанию." },
    { id: "zakusok", title: "Набор закусок", img: "nabor-zakusok", text: "Канапе, брускетты, тарталетки и профитроли — ассорти для фуршета." }
  ],
  setGuests: ["5–10", "10–20", "20–40", "больше 40"],

  // Food box — отдельный блок под меню. id не меняйте (он из прайса). items — что входит в бокс.
  // photos — до 4 фото из папки img/menu (имя файла без .webp); extras — клетки с рисунком, если фото не хватает
  boxes: [
    { id: "food-box-1-lyulya-shashlychki-dolki-luk", title: "Food box №1", tagline: "Люля и шашлычки",
      items: ["Люля-кебаб", "Шашлычки из свинины и курицы", "Картофельные дольки", "Маринованный лук", "Салат «Витаминный»", "Соусы"],
      photos: ["mini-lyulya-kebab", "mini-shashlychok-iz-svininy", "zapechennye-kartofelnye-dolki", "vitaminnyy"] },
    { id: "food-box-2-kupaty-shashlyki-shampinony-s", title: "Food box №2", tagline: "Купаты и шашлыки",
      items: ["Купаты", "Шашлыки из свинины и курицы", "Шампиньоны", "Салат «Витаминный»", "Соусы"],
      photos: ["shashlychok-iz-tsyplenka-s-tomatami", "mini-shashlychok-iz-svininy", "farshirovannye-shampinony", "vitaminnyy"] },
    { id: "food-box-3-ovoschi-gril", title: "Food box №3", tagline: "Овощи гриль",
      items: ["Шампиньоны", "Кабачок", "Кукуруза", "Картофель", "Болгарский перец", "Соусы"],
      photos: ["kukuruza-gril", "ovoschi-gril", "farshirovannye-shampinony", "zapechennye-kartofelnye-dolki"] }
  ]
};
